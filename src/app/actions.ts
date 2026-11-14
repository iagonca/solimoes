"use server";
// Mutações do site. Cada ação confere o perfil antes de tocar no banco:
// a proteção de rota do proxy não basta, porque uma action pode ser chamada direto.
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { pool, sqlOne } from "@/lib/db";
import { assertRole, TECH_ROLES, type Role } from "@/lib/session";

async function logEvent(ticketId: number, actor: string, kind: string, note: string | null = null) {
  await pool.query("insert into ticket_events (ticket_id, ts, actor, kind, note) values ($1, app_now(), $2, $3, $4)", [ticketId, actor, kind, note]);
}

function refreshTicketViews(id: number) {
  revalidatePath(`/painel/chamados/${id}`);
  revalidatePath("/painel/chamados");
  revalidatePath("/painel");
  revalidatePath("/agente");
}

// ---------- Equipe técnica ----------

export async function assumeTicket(id: number) {
  const me = await assertRole(...TECH_ROLES);
  await pool.query(
    `update tickets set assignee_email = $2, status = case when status = 'aberto' then 'em_analise' else status end, updated_at = app_now()
     where id = $1 and status <> 'resolvido'`, [id, me.email]);
  await logEvent(id, me.display_name, "em_analise", "Assumiu o chamado.");
  refreshTicketViews(id);
}

export async function saveDiagnosis(formData: FormData) {
  const me = await assertRole(...TECH_ROLES);
  const id = Number(formData.get("id"));
  const diagnosis = String(formData.get("diagnosis") ?? "").trim();
  const code = String(formData.get("protocol") ?? "");
  const send = formData.get("send") === "1";

  const protocol = code ? await sqlOne<{ id: number; title: string }>("select id, title from protocols where code = $1", [code]) : null;
  await pool.query(
    `update tickets set diagnosis = $2, protocol_id = $3, assignee_email = coalesce(assignee_email, $4), updated_at = app_now(),
       status = case when status = 'aberto' then 'em_analise' else status end
     where id = $1`, [id, diagnosis || null, protocol?.id ?? null, me.email]);
  await logEvent(id, me.display_name, "diagnostico", diagnosis || null);

  if (send && protocol) {
    // A mensagem vai para a fila do hub. Se o hub está offline, fica esperando a conexão voltar.
    const ctx = await sqlOne<{ community_id: number; house_number: number | null; hub_online: boolean }>(`
      select a.community_id, s.house_number, (c.hub_last_seen >= app_now() - interval '2 hours') as hub_online
      from tickets t join alerts a on a.id = t.alert_id join communities c on c.id = a.community_id
      left join systems s on s.id = a.system_id where t.id = $1`, [id]);
    await pool.query(
      `update tickets set status = 'aguardando_acao_local', current_step = 0, updated_at = app_now() where id = $1`, [id]);
    await pool.query(
      `insert into outbox (community_id, ticket_id, channel, body, queued_at, sent_at)
       values ($1, $2, 'whatsapp', $3, app_now(), case when $4 then app_now() end)`,
      [ctx!.community_id, id, `Solimões: ${protocol.title}${ctx!.house_number ? ` na Casa ${ctx!.house_number}` : ""}. Abra o app para ver os passos.`, ctx!.hub_online]);
    await logEvent(id, me.display_name, "aguardando_acao_local", `Protocolo ${code} enviado ao agente local${ctx!.hub_online ? "" : " (na fila até o hub voltar)"}.`);
  }
  refreshTicketViews(id);
}

export async function setTicketStatus(id: number, status: "em_analise" | "resolvido") {
  const me = await assertRole(...TECH_ROLES);
  await pool.query(
    `update tickets set status = $2, updated_at = app_now(), resolved_at = case when $2 = 'resolvido' then app_now() else null end,
       verified_improved = null where id = $1`, [id, status]);
  await logEvent(id, me.display_name, status, status === "resolvido" ? "Resolvido pela equipe técnica." : "Voltou para análise.");
  refreshTicketViews(id);
}

export async function setLogisticsStatus(id: number, status: "pendente" | "embarcado" | "entregue") {
  await assertRole(...TECH_ROLES);
  await pool.query("update logistics_items set status = $2 where id = $1", [id, status]);
  revalidatePath("/painel/logistica");
  revalidatePath("/agente");
}

export async function addLogisticsItem(formData: FormData) {
  await assertRole(...TECH_ROLES);
  const communityId = Number(formData.get("community_id"));
  const item = String(formData.get("item") ?? "").trim();
  const qty = Math.max(1, Number(formData.get("qty") ?? 1));
  if (!communityId || !item) return;
  await pool.query("insert into logistics_items (community_id, item, qty) values ($1, $2, $3)", [communityId, item, qty]);
  revalidatePath("/painel/logistica");
}

export async function refreshAlerts() {
  await assertRole(...TECH_ROLES);
  await pool.query("select refresh_alerts()");
  revalidatePath("/painel", "layout");
}

// ---------- Agente local ----------

async function agentTicket(id: number) {
  const me = await assertRole("agente");
  const t = await sqlOne<{ id: number; current_step: number; steps: number; community_id: number }>(`
    select t.id, t.current_step, jsonb_array_length(p.steps) as steps, a.community_id
    from tickets t join alerts a on a.id = t.alert_id join protocols p on p.id = t.protocol_id
    where t.id = $1 and t.status = 'aguardando_acao_local'`, [id]);
  // O agente só mexe nos chamados da própria comunidade.
  if (!t || t.community_id !== me.community_id) throw new Error("Tarefa não encontrada");
  return { me, t };
}

export async function agentNextStep(id: number) {
  const { me, t } = await agentTicket(id);
  const next = Math.min(t.current_step + 1, t.steps);
  await pool.query("update tickets set current_step = $2, updated_at = app_now() where id = $1", [id, next]);
  await logEvent(id, me.display_name, "passo", `Passo ${next} de ${t.steps} feito.`);
  revalidatePath(`/agente/tarefa/${id}`);
  revalidatePath("/agente");
}

export async function agentConfirm(id: number) {
  const { me } = await agentTicket(id);
  await pool.query(
    `update tickets set status = 'resolvido', local_done_at = app_now(), resolved_at = app_now(), updated_at = app_now(),
       verified_improved = null where id = $1`, [id]);
  await logEvent(id, me.display_name, "resolvido", "O agente confirmou que fez o conserto. O sistema vai conferir se os dados melhoram.");
  refreshTicketViews(id);
  redirect("/agente?feito=1");
}

export async function agentNeedHelp(formData: FormData) {
  const id = Number(formData.get("id"));
  const note = String(formData.get("note") ?? "").trim();
  const { me } = await agentTicket(id);
  await pool.query("update tickets set status = 'em_analise', updated_at = app_now() where id = $1", [id]);
  await logEvent(id, me.display_name, "pedido_ajuda", note || "Não consegui fazer. Preciso de ajuda.");
  refreshTicketViews(id);
  redirect("/agente?ajuda=1");
}

// ---------- Coordenação ----------

export async function updateProfile(formData: FormData) {
  await assertRole("coordenador");
  const email = String(formData.get("email"));
  const role = String(formData.get("role")) as Role;
  const communityId = Number(formData.get("community_id")) || null;
  const systemId = Number(formData.get("system_id")) || null;
  const active = formData.get("active") === "on";
  await pool.query(
    "update profiles set role = $2, community_id = $3, system_id = $4, active = $5 where email = $1",
    [email, role, communityId, role === "morador" ? systemId : null, active]);
  revalidatePath("/painel/cadastros");
}

export type NewAccountResult = { ok: true; email: string; password: string } | { ok: false; error: string } | null;

// Cria a conta no Neon Auth e o perfil. A senha provisória aparece uma vez para a coordenação repassar.
export async function createAccount(_: NewAccountResult, formData: FormData): Promise<NewAccountResult> {
  await assertRole("coordenador");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role")) as Role;
  const communityId = Number(formData.get("community_id")) || null;
  if (!email || !name || !["engenheiro", "coordenador", "agente", "morador"].includes(role)) return { ok: false, error: "Preencha nome, e-mail e perfil." };
  if ((role === "agente" || role === "morador") && !communityId) return { ok: false, error: "Agente e morador precisam de uma comunidade." };

  const password = randomBytes(9).toString("base64url");
  const res = await fetch(`${process.env.NEON_AUTH_BASE_URL}/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: process.env.APP_ORIGIN ?? "http://localhost:3000" },
    body: JSON.stringify({ email, name, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: /exist/i.test(text) ? "Já existe uma conta com esse e-mail." : `Falha ao criar a conta (${res.status}).` };
  }
  await pool.query(
    `insert into profiles (email, display_name, role, community_id) values ($1, $2, $3, $4)
     on conflict (email) do update set display_name = excluded.display_name, role = excluded.role, community_id = excluded.community_id, active = true`,
    [email, name, role, communityId]);
  revalidatePath("/painel/cadastros");
  return { ok: true, email, password };
}

// ---------- Pedidos de ajuda ----------

const MORADOR_REASONS = ["sem_luz", "bateria_apitando", "aparelho_nao_liga", "outro"];
const AGENTE_REASONS = ["duvida_protocolo", "problema_tecnico", "outro"];

function refreshHelpViews() {
  revalidatePath("/casa");
  revalidatePath("/agente");
  revalidatePath("/painel/pedidos");
  revalidatePath("/painel", "layout");
}

// Morador pede ajuda: vai para o agente local e para a engenharia ao mesmo tempo.
export async function residentRequestHelp(formData: FormData) {
  const me = await assertRole("morador");
  const reason = String(formData.get("reason") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!MORADOR_REASONS.includes(reason) || !me.system_id || !me.community_id) throw new Error("Pedido inválido");
  await pool.query(
    `insert into help_requests (community_id, system_id, requester_email, requester_role, target, reason, note, created_at, updated_at)
     values ($1, $2, $3, 'morador', 'agente_engenharia', $4, $5, app_now(), app_now())`,
    [me.community_id, me.system_id, me.email, reason, note]);
  refreshHelpViews();
  redirect("/casa?pedido=1");
}

// Agente pede ajuda à engenharia, opcionalmente indicando a casa.
export async function agentRequestHelp(formData: FormData) {
  const me = await assertRole("agente");
  const reason = String(formData.get("reason") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  const systemId = Number(formData.get("system_id")) || null;
  if (!AGENTE_REASONS.includes(reason) || !me.community_id) throw new Error("Pedido inválido");
  if (systemId) {
    const ok = await sqlOne("select 1 from systems where id = $1 and community_id = $2", [systemId, me.community_id]);
    if (!ok) throw new Error("Casa fora da sua comunidade");
  }
  await pool.query(
    `insert into help_requests (community_id, system_id, requester_email, requester_role, target, reason, note, created_at, updated_at)
     values ($1, $2, $3, 'agente', 'engenharia', $4, $5, app_now(), app_now())`,
    [me.community_id, systemId, me.email, reason, note]);
  refreshHelpViews();
  redirect("/agente?pedido=1");
}

// Atender um pedido: o agente só nos pedidos de moradores da própria comunidade;
// a equipe técnica em qualquer um.
export async function updateHelpRequest(formData: FormData) {
  const id = Number(formData.get("id"));
  const status = String(formData.get("status"));
  const response = String(formData.get("response") ?? "").trim() || null;
  if (!["em_atendimento", "resolvido"].includes(status)) throw new Error("Status inválido");
  const req = await sqlOne<{ community_id: number; target: string }>("select community_id, target from help_requests where id = $1", [id]);
  if (!req) throw new Error("Pedido não encontrado");
  const me = await assertRole("agente", ...TECH_ROLES);
  if (me.role === "agente" && (req.community_id !== me.community_id || req.target !== "agente_engenharia")) throw new Error("Não autorizado");
  await pool.query(
    `update help_requests set status = $2, handled_by_email = $3, response = coalesce($4, response), updated_at = app_now(),
       resolved_at = case when $2 = 'resolvido' then app_now() end
     where id = $1`, [id, status, me.email, response]);
  refreshHelpViews();
}

// ---------- Comunidades (coordenação) ----------

export type FormResult = { ok: false; error: string; values?: Record<string, string> } | { ok: true; message: string } | null;

// Devolve o erro junto com o que foi digitado: o React 19 limpa o formulário depois da action.
function fail(formData: FormData, error: string): FormResult {
  const values: Record<string, string> = {};
  formData.forEach((v, k) => { if (typeof v === "string" && !k.startsWith("$")) values[k] = v; });
  return { ok: false, error, values };
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function num(formData: FormData, key: string): number {
  const v = Number(String(formData.get(key) ?? "").replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
}
function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

// Campos da comunidade, validados. Coordenadas restritas ao território brasileiro.
function readCommunity(formData: FormData) {
  const c = {
    name: text(formData, "name"),
    slug: text(formData, "slug").toLowerCase(),
    municipality: text(formData, "municipality"),
    lat: num(formData, "lat"),
    lon: num(formData, "lon"),
    agent_name: text(formData, "agent_name") || null,
    agent_phone: text(formData, "agent_phone") || null,
    boat_next_trip: text(formData, "boat_next_trip") || null,
  };
  if (!c.name || !c.municipality) return { error: "Preencha nome e município." } as const;
  if (!SLUG_RE.test(c.slug)) return { error: "O identificador só pode ter letras minúsculas, números e hífen (ex.: vila-nova)." } as const;
  if (!(c.lat >= -34 && c.lat <= 6) || !(c.lon >= -74 && c.lon <= -34)) return { error: "Coordenadas fora do Brasil. Use graus decimais (ex.: -3.53 e -64.39)." } as const;
  return { c } as const;
}

export async function createCommunity(_: FormResult, formData: FormData): Promise<FormResult> {
  await assertRole("coordenador");
  const parsed = readCommunity(formData);
  if ("error" in parsed) return fail(formData, parsed.error!);
  const { c } = parsed;
  const kit = {
    houses: Math.trunc(num(formData, "houses")),
    battery_model: text(formData, "battery_model"),
    battery_count: Math.trunc(num(formData, "battery_count")),
    bank_v: num(formData, "bank_v"),
    bank_ah: num(formData, "bank_ah"),
    panel_count: Math.trunc(num(formData, "panel_count")),
    panel_wp: num(formData, "panel_wp"),
    installed_on: text(formData, "installed_on"),
    rint: num(formData, "rint"),
  };
  if (!(kit.houses >= 1 && kit.houses <= 50)) return fail(formData, "Número de casas entre 1 e 50.");
  if (!kit.battery_model || !(kit.battery_count >= 1) || !(kit.bank_v > 0) || !(kit.bank_ah > 0) || !(kit.panel_count >= 1) || !(kit.panel_wp > 0) || !(kit.rint > 0))
    return fail(formData, "Confira o kit padrão: todos os números precisam ser positivos.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(kit.installed_on)) return fail(formData, "Informe a data de instalação.");

  const client = await pool.connect();
  try {
    await client.query("begin");
    const exists = await client.query("select 1 from communities where slug = $1", [c.slug]);
    if (exists.rowCount) { await client.query("rollback"); return fail(formData, "Já existe uma comunidade com esse identificador."); }
    const { rows: [com] } = await client.query<{ id: number }>(
      `insert into communities (slug, name, municipality, lat, lon, agent_name, agent_phone, boat_next_trip)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [c.slug, c.name, c.municipality, c.lat, c.lon, c.agent_name, c.agent_phone, c.boat_next_trip]);
    // Casas numa grade em volta do ponto da comunidade (~300 m entre casas); ajuste depois na edição.
    const cols = Math.ceil(Math.sqrt(kit.houses));
    for (let n = 1; n <= kit.houses; n++) {
      const i = n - 1;
      const lat = c.lat + (Math.floor(i / cols) - (cols - 1) / 2) * 0.0027;
      const lon = c.lon + ((i % cols) - (cols - 1) / 2) * 0.0027;
      const { rows: [sys] } = await client.query<{ id: number }>(
        `insert into systems (community_id, house_number, family_name, lat, lon, battery_model, battery_count, bank_nominal_v,
           bank_nominal_ah, panel_count, panel_wp, installed_on, rint_initial_mohm)
         values ($1,$2,'A definir',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
        [com.id, n, lat, lon, kit.battery_model, kit.battery_count, kit.bank_v, kit.bank_ah, kit.panel_count, kit.panel_wp, kit.installed_on, kit.rint]);
      await client.query(`insert into appliances (system_id, kind, label, watts, essential) values ($1, 'luz', 'Lâmpadas', 27, true)`, [sys.id]);
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
  revalidatePath("/painel", "layout");
  redirect(`/painel/cadastros/comunidades/${c.slug}?criada=1`);
}

export async function updateCommunity(_: FormResult, formData: FormData): Promise<FormResult> {
  await assertRole("coordenador");
  const id = Number(formData.get("id"));
  const parsed = readCommunity(formData);
  if ("error" in parsed) return fail(formData, parsed.error!);
  const { c } = parsed;
  const clash = await sqlOne("select 1 from communities where slug = $1 and id <> $2", [c.slug, id]);
  if (clash) return fail(formData, "Já existe outra comunidade com esse identificador.");
  await pool.query(
    `update communities set slug=$2, name=$3, municipality=$4, lat=$5, lon=$6, agent_name=$7, agent_phone=$8, boat_next_trip=$9 where id=$1`,
    [id, c.slug, c.name, c.municipality, c.lat, c.lon, c.agent_name, c.agent_phone, c.boat_next_trip]);
  revalidatePath("/painel", "layout");
  if (formData.get("old_slug") !== c.slug) redirect(`/painel/cadastros/comunidades/${c.slug}`);
  return { ok: true, message: "Comunidade salva." };
}

export async function updateHouse(_: FormResult, formData: FormData): Promise<FormResult> {
  await assertRole("coordenador");
  const id = Number(formData.get("id"));
  const h = {
    family: text(formData, "family_name"), lat: num(formData, "lat"), lon: num(formData, "lon"),
    model: text(formData, "battery_model"), wp: num(formData, "panel_wp"), installed: text(formData, "installed_on"),
    node: text(formData, "node_id") || null,
  };
  if (h.node && !/^[A-Za-z0-9_-]{1,64}$/.test(h.node)) return fail(formData, "O nó só pode ter letras, números, - e _ (ex.: casa-01).");
  if (h.node) {
    const taken = await sqlOne("select 1 from systems where node_id = $1 and id <> $2", [h.node, id]);
    if (taken) return fail(formData, `O nó ${h.node} já está ligado a outra casa.`);
  }
  if (!h.family || !h.model) return fail(formData, "Família e modelo da bateria são obrigatórios.");
  if (!(h.lat >= -34 && h.lat <= 6) || !(h.lon >= -74 && h.lon <= -34)) return fail(formData, "Coordenadas fora do Brasil.");
  if (!(h.wp > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(h.installed)) return fail(formData, "Confira a potência do painel e a data de instalação.");
  await pool.query(
    "update systems set family_name=$2, lat=$3, lon=$4, battery_model=$5, panel_wp=$6, installed_on=$7, node_id=$8 where id=$1",
    [id, h.family, h.lat, h.lon, h.model, h.wp, h.installed, h.node]);
  revalidatePath("/painel", "layout");
  return { ok: true, message: "Salvo." };
}

// ---------- Contato (página pública) ----------

const AUDIENCES = ["comunidade", "concessionaria", "governo", "outro"];

// Pública: qualquer visitante envia. Campo "site" é armadilha para robôs (fica escondido para pessoas).
export async function sendContact(_: FormResult, formData: FormData): Promise<FormResult> {
  if (text(formData, "site")) return { ok: true, message: "Mensagem enviada. Respondemos pelo e-mail informado." };
  const name = text(formData, "name");
  const email = text(formData, "email").toLowerCase();
  const organization = text(formData, "organization") || null;
  const audience = text(formData, "audience");
  const message = text(formData, "message");
  if (!name || !message) return fail(formData, "Preencha seu nome e a mensagem.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(formData, "Confira o e-mail: precisamos dele para responder.");
  if (!AUDIENCES.includes(audience)) return fail(formData, "Escolha quem você representa.");
  if (name.length > 120 || message.length > 4000 || (organization?.length ?? 0) > 160) return fail(formData, "A mensagem ficou longa demais.");
  await pool.query(
    "insert into contact_messages (name, email, organization, audience, message) values ($1, $2, $3, $4, $5)",
    [name, email, organization, audience, message]);
  revalidatePath("/painel/contatos");
  return { ok: true, message: "Mensagem enviada. Respondemos pelo e-mail informado." };
}

export async function markContactHandled(id: number, handled: boolean) {
  await assertRole("coordenador");
  await pool.query("update contact_messages set handled = $2 where id = $1", [id, handled]);
  revalidatePath("/painel/contatos");
}
