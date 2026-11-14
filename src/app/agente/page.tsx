import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton, SpeakButton } from "@/components/client";
import { Icon } from "@/components/Icon";
import { SEVERITY } from "@/lib/format";
import { HelpRequestCard } from "@/components/HelpRequestCard";
import { getAgentTasks, getCommunity, getHelpRequests, getLogistics, getNow, getSystems, type TicketRow } from "@/lib/queries";
import { sqlOne } from "@/lib/db";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Hoje" };

export default async function AgentHome({ searchParams }: { searchParams: Promise<{ feito?: string; ajuda?: string; pedido?: string }> }) {
  const me = await requireRole("agente");
  const sp = await searchParams;
  const slugRow = await sqlOne<{ slug: string }>("select slug from communities where id = $1", [me.community_id]);
  const community = slugRow ? await getCommunity(slugRow.slug) : null;
  if (!community) return <p style={{ padding: 20 }}>Seu perfil ainda não tem comunidade. Fale com a coordenação.</p>;
  const [tasks, houses, logistics, requests, now] = await Promise.all([
    getAgentTasks(community.id), getSystems({ communityId: community.id }), getLogistics(community.id),
    getHelpRequests({ communityId: community.id, includeResolvedDays: 1 }), getNow(),
  ]);
  const residentRequests = requests.filter((r) => r.requester_role === "morador");
  const firstName = me.display_name.split(" ")[0];
  const ok = houses.filter((h) => h.status === "verde").length;
  const pending = logistics.filter((l) => l.status !== "entregue");
  const speech = tasks.length
    ? `Olá, ${firstName}. Você tem ${tasks.length} ${tasks.length === 1 ? "tarefa" : "tarefas"} hoje. A primeira é ${tasks[0].protocol_title}, na casa ${tasks[0].house_number}.`
    : `Olá, ${firstName}. Nenhuma tarefa hoje. ${ok} casas estão bem.`;

  return (
    <>
      <header className="phone-head">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span className="eyebrow" style={{ color: "var(--sage)" }}>{community.name}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <SpeakButton text={speech} />
          </div>
        </div>
        <h1>Olá, {firstName}</h1>
        <p style={{ margin: "6px 0 0", color: "var(--sage)", fontSize: 16 }}>
          {tasks.length ? `${tasks.length} ${tasks.length === 1 ? "tarefa" : "tarefas"} para hoje` : "Nenhuma tarefa hoje"} · {ok} de {houses.length} casas bem
        </p>
      </header>
      <div className="phone-body">
        {sp.feito && <p role="status" style={{ margin: 0, background: "var(--sage)", padding: "12px 14px", borderRadius: 6, fontSize: 16 }}>Obrigado. A engenheira já sabe, e o sistema vai acompanhar a casa.</p>}
        {sp.ajuda && <p role="status" style={{ margin: 0, background: "var(--ochre)", padding: "12px 14px", borderRadius: 6, fontSize: 16 }}>Pedido de ajuda enviado. A engenheira responde pelas mensagens.</p>}

        {sp.pedido && <p role="status" style={{ margin: 0, background: "var(--sage)", padding: "12px 14px", borderRadius: 6, fontSize: 16 }}>Pedido enviado à equipe técnica.</p>}

        {tasks.map((t, i) => <TaskCard key={t.id} t={t} first={i === 0} />)}

        {residentRequests.length > 0 && (
          <section className="stack" style={{ gap: 10 }} aria-label="Pedidos dos moradores">
            <div className="eyebrow">Pedidos dos moradores</div>
            {residentRequests.map((r) => <HelpRequestCard key={r.id} r={r} now={now} big />)}
          </section>
        )}

        <Link href="/agente/ajuda" className="btn big"><Icon name="chamado" /> Pedir ajuda à engenharia</Link>

        <section>
          <div className="eyebrow" style={{ marginBottom: 8 }}>As casas agora</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {houses.sort((a, b) => a.house_number - b.house_number).map((h) => {
              const s = SEVERITY[h.status];
              return (
                <div key={h.id} style={{ background: s.soft, borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
                    <span>Casa {h.house_number}</span><span aria-label={s.label}>{s.glyph}</span>
                  </div>
                  <div className="num" style={{ fontSize: 18 }}>{h.status === "cinza" ? "—" : `${Math.round(h.soc ?? 0)}%`}</div>
                </div>
              );
            })}
          </div>
        </section>

        {pending.length > 0 && (
          <section className="card">
            <div className="card-h"><h2 style={{ fontSize: 17 }}>Vem no próximo barco</h2><span className="eyebrow">{community.boat_next_trip?.slice(8, 10)}/{community.boat_next_trip?.slice(5, 7)}</span></div>
            <ul className="dashed" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {pending.map((l) => <li key={l.id} style={{ padding: "8px 14px", fontSize: 15 }}>{l.qty}× {l.item}</li>)}
            </ul>
          </section>
        )}
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "center" }}><SignOutButton /></div>
      </div>
    </>
  );
}

function TaskCard({ t, first }: { t: TicketRow & { current_step: number; steps_total: number; minutes: number | null }; first: boolean }) {
  const s = SEVERITY[t.severity];
  return (
    <Link href={`/agente/tarefa/${t.id}`} className="card" style={{ textDecoration: "none", color: "var(--ink)", overflow: "hidden" }}>
      <div style={{ background: s.soft, padding: "12px 14px", display: "flex", gap: 12, alignItems: "center" }}>
        <span className="glyph" style={{ width: 36, height: 36, background: s.bg, color: s.fg }} aria-label={s.label}>{s.glyph}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>Casa {t.house_number ?? "—"}</div>
          <div style={{ fontSize: 14, color: s.ink }}>{t.title}</div>
        </div>
        <Icon name="seta" />
      </div>
      <div style={{ padding: "12px 14px" }}>
        <div className="eyebrow">{t.protocol_code} · enviado por {t.assignee_name}</div>
        <div style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 400, marginTop: 2 }}>{t.protocol_title}</div>
        <div style={{ display: "flex", gap: 4, marginTop: 10 }} aria-label={`Passo ${t.current_step} de ${t.steps_total}`}>
          {Array.from({ length: t.steps_total }, (_, i) => (
            <span key={i} style={{ flex: 1, height: 8, borderRadius: 4, background: i < t.current_step ? "var(--forest)" : "var(--paper-3)" }} />
          ))}
        </div>
        <div style={{ marginTop: 10 }} className={first ? "btn primary big" : "btn big"}>
          {t.current_step === 0 ? "Começar" : t.current_step >= t.steps_total ? "Confirmar que terminei" : `Continuar do passo ${t.current_step + 1}`}
        </div>
      </div>
    </Link>
  );
}
