import "server-only";
import { sql, sqlOne } from "@/lib/db";
import type { Severity } from "@/lib/format";

// Toda a leitura de dados do site passa por aqui. Os indicadores vêm prontos
// das views do Postgres (db/migrations); este arquivo só seleciona e junta.

// Meia-noite de hoje no fuso de Manaus, como timestamptz (permite usar o índice por hora).
const DAY_START = "(local_day((select app_now()))::timestamp at time zone 'America/Manaus')";

// Sem pacotes do ESP32, os indicadores guardados são recalculados quando alguém abre o
// painel e a última atualização tem mais de 5 min. Roda depois da resposta (after()).
export async function refreshIndicatorsIfStale() {
  const r = await sql<{ stale: boolean }>(
    "select (value::timestamptz < now() - interval '5 minutes') as stale from settings where key = 'last_indicators'");
  if (!r[0]?.stale) return;
  const turn = await sql(
    `update settings set value = now()::text
     where key = 'last_refresh' and value::timestamptz < now() - interval '30 seconds' returning 1`);
  if (turn.length) await sql("select refresh_alerts()");
}

export async function getNow(): Promise<Date> {
  const r = await sqlOne<{ now: Date }>("select app_now() as now");
  return r!.now;
}

export type Kpis = {
  systems: number; online: number; e_gen_today_kwh: number; e_load_today_kwh: number;
  irr_today: number | null; pr_avg: number | null; health_avg: number; diesel_l_30d: number; co2_kg_30d: number;
  tickets_open: number; tickets_resolved_30d: number; alerts_red: number;
};

export async function getKpis(): Promise<Omit<Kpis, "health_avg">> {
  // Impacto e PR vêm das versões pré-calculadas (mv_*, atualizadas com os alertas).
  // A energia do dia soma a telemetria desde a meia-noite de Manaus, usando o índice por hora.
  // A saúde média sai da tabela de sistemas.
  return (await sqlOne<Omit<Kpis, "health_avg">>(`
    select
      (select count(*) from systems)::int as systems,
      (select count(*) from systems where last_seen >= (select app_now()) - interval '2 hours')::int as online,
      (select coalesce(sum(p_panel_avg * dt_h), 0) / 1000 from telemetry where ts >= ${DAY_START}) as e_gen_today_kwh,
      (select coalesce(sum(p_load_avg * dt_h), 0) / 1000 from telemetry where ts >= ${DAY_START}) as e_load_today_kwh,
      (select avg(kwh_m2) from hub_irradiance where day = local_day((select app_now()))) as irr_today,
      (select avg(pr_7d) from mv_pr_7d) as pr_avg,
      i.diesel_l_30d, i.co2_kg_30d, i.tickets_resolved_30d::int as tickets_resolved_30d,
      (select count(*) from tickets where status <> 'resolvido')::int as tickets_open,
      (select count(*) from alerts where closed_at is null and severity = 'vermelho')::int as alerts_red
    from mv_impact i
  `))!;
}

export type CommunityRow = {
  id: number; slug: string; name: string; municipality: string; lat: number; lon: number;
  status: Severity; houses: number; red: number; yellow: number; agent_name: string | null; hub_last_seen: Date | null;
};

export async function getCommunities(): Promise<CommunityRow[]> {
  return sql<CommunityRow>(`
    select c.id, c.slug, c.name, c.municipality, c.lat, c.lon, cs.status, c.agent_name, c.hub_last_seen,
      (select count(*) from systems s where s.community_id = c.id)::int as houses,
      (select count(*) from v_system_status st where st.community_id = c.id and st.status = 'vermelho')::int as red,
      (select count(*) from v_system_status st where st.community_id = c.id and st.status = 'amarelo')::int as yellow
    from communities c join v_community_status cs on cs.community_id = c.id
    order by severity_rank(cs.status) desc, c.name`);
}

export type AlertRow = {
  id: number; severity: Severity; title: string; action: string; value: number | null; opened_at: Date;
  rule: string; community: string; community_slug: string; system_id: number | null; house_number: number | null;
  family_name: string | null; ticket_id: number | null; ticket_status: string | null;
};

export async function getOpenAlerts(communityId?: number): Promise<AlertRow[]> {
  return sql<AlertRow>(`
    select a.id, a.severity, a.title, a.action, a.value, a.opened_at, a.rule,
      c.name as community, c.slug as community_slug, a.system_id, s.house_number, s.family_name,
      t.id as ticket_id, t.status as ticket_status
    from alerts a
    join communities c on c.id = a.community_id
    left join systems s on s.id = a.system_id
    left join tickets t on t.alert_id = a.id
    where a.closed_at is null and ($1::int is null or a.community_id = $1)
    order by severity_rank(a.severity) desc, a.opened_at desc`, [communityId ?? null]);
}

export type SystemRow = {
  id: number; house_number: number; family_name: string; community: string; community_slug: string; community_id: number;
  status: Severity; health: number; v_bat: number | null; t_bat: number | null; soc: number | null;
  rint_ratio: number | null; pr_7d: number | null; h_below_50_30d: number; last_seen: Date | null;
  e_gen_today_wh: number | null; e_load_today_wh: number | null; spark: number[] | null; lat: number; lon: number;
};

export async function getSystems(opts: { communityId?: number; limit?: number } = {}): Promise<SystemRow[]> {
  return sql<SystemRow>(`
    select s.id, s.house_number, s.family_name, c.name as community, c.slug as community_slug, c.id as community_id,
      st.status, h.health, l.v_bat_avg as v_bat, l.t_bat_max as t_bat, l.soc, h.rint_ratio, h.pr_7d, h.h_below_50_30d,
      s.last_seen, s.lat, s.lon, d.e_gen_wh as e_gen_today_wh, d.e_load_wh as e_load_today_wh,
      (select array_agg(b.soc order by b.bin) from (
         select date_bin('15 minutes', t.ts, timestamptz '2000-01-01') as bin, avg(t.soc)::real as soc
         from telemetry t where t.system_id = s.id and t.ts > s.last_seen - interval '24 hours' and t.soc is not null
         group by 1) b) as spark   -- médias de 15 min: o nó real manda um pacote a cada poucos segundos
    from systems s
    join communities c on c.id = s.community_id
    join v_system_status st on st.system_id = s.id
    join mv_health h on h.system_id = s.id
    left join lateral (   -- último pacote da casa, direto pelo índice (system_id, ts)
      select t.v_bat_avg, t.t_bat_max, t.soc from telemetry t where t.system_id = s.id order by t.ts desc limit 1
    ) l on true
    left join lateral (
      select sum(t.p_panel_avg * t.dt_h) as e_gen_wh, sum(t.p_load_avg * t.dt_h) as e_load_wh
      from telemetry t where t.system_id = s.id and t.ts >= ${DAY_START}
    ) d on true
    where ($1::int is null or s.community_id = $1)
    order by severity_rank(st.status) desc, h.health asc, c.name, s.house_number
    limit $2`, [opts.communityId ?? null, opts.limit ?? 500]);
}

export type TicketRow = {
  id: number; status: string; assignee_email: string | null; assignee_name: string | null; diagnosis: string | null;
  protocol_code: string | null; protocol_title: string | null; created_at: Date; updated_at: Date;
  resolved_at: Date | null; verified_improved: boolean | null; severity: Severity; title: string; rule: string;
  community: string; community_slug: string; community_id: number; system_id: number | null; house_number: number | null;
  alert_closed_at: Date | null;
};

const TICKET_SELECT = `
  select t.id, t.status, t.assignee_email, p.display_name as assignee_name, t.diagnosis,
    pr.code as protocol_code, pr.title as protocol_title, t.created_at, t.updated_at, t.resolved_at, t.verified_improved,
    a.severity, a.title, a.rule, a.closed_at as alert_closed_at, c.name as community, c.slug as community_slug,
    c.id as community_id, a.system_id, s.house_number
  from tickets t
  join alerts a on a.id = t.alert_id
  join communities c on c.id = a.community_id
  left join systems s on s.id = a.system_id
  left join protocols pr on pr.id = t.protocol_id
  left join profiles p on p.email = t.assignee_email`;

export async function getTickets(): Promise<TicketRow[]> {
  return sql<TicketRow>(`${TICKET_SELECT}
    where t.status <> 'resolvido' or t.resolved_at > (select app_now()) - interval '30 days'
    order by case t.status when 'aberto' then 0 when 'em_analise' then 1 when 'aguardando_acao_local' then 2 else 3 end,
      severity_rank(a.severity) desc, t.updated_at desc`);
}

export async function getTicket(id: number) {
  const ticket = await sqlOne<TicketRow & { protocol_id: number | null; current_step: number; local_done_at: Date | null; action: string; value: number | null }>(
    `${TICKET_SELECT.replace("select t.id,", "select t.protocol_id, t.current_step, t.local_done_at, a.action, a.value, t.id,")} where t.id = $1`, [id]);
  if (!ticket) return null;
  const events = await sql<{ ts: Date; actor: string; kind: string; note: string | null }>(
    "select ts, actor, kind, note from ticket_events where ticket_id = $1 order by ts", [id]);
  const messages = await sql<{ channel: string; body: string; queued_at: Date; sent_at: Date | null }>(
    "select channel, body, queued_at, sent_at from outbox where ticket_id = $1 order by queued_at", [id]);
  return { ticket, events, messages };
}

export type Protocol = { id: number; code: string; title: string; summary: string; minutes: number; steps: { text: string; icon: string }[] };

export async function getProtocols(): Promise<(Protocol & { uses_30d: number })[]> {
  return sql(`select p.*, (select count(*) from tickets t where t.protocol_id = p.id and t.created_at > (select app_now()) - interval '30 days')::int as uses_30d
              from protocols p order by p.code`);
}

export async function getProtocol(code: string): Promise<Protocol | null> {
  return sqlOne<Protocol>("select * from protocols where code = $1", [code]);
}

export async function getSystem(id: number) {
  return sqlOne<{
    id: number; house_number: number; family_name: string; battery_model: string; battery_count: number;
    bank_nominal_v: number; bank_nominal_ah: number; battery_chemistry: string; panel_count: number; panel_wp: number;
    installed_on: string; rint_initial_mohm: number; last_seen: Date; community: string; community_slug: string;
    community_id: number; agent_name: string | null; agent_phone: string | null; status: Severity;
    health: number; rint_mohm: number | null; rint_ratio: number | null; capacity_ah: number | null;
    h_below_50_30d: number; h_above_40_30d: number; days_since_full: number; throughput_ratio: number; pr_7d: number | null;
    soc: number | null; v_bat: number | null; t_bat: number | null; rh_box: number | null; v_mid_delta: number | null;
    p_panel: number | null; p_load: number | null; cut: boolean;
  }>(`
    select s.*, c.name as community, c.slug as community_slug, c.agent_name, c.agent_phone, st.status,
      h.health, h.rint_mohm, h.rint_ratio, h.capacity_ah, h.h_below_50_30d, h.h_above_40_30d, h.days_since_full,
      h.throughput_ratio, h.pr_7d, l.soc, l.v_bat_avg as v_bat, l.t_bat_max as t_bat, l.rh_box, l.v_mid_delta,
      l.p_panel_avg as p_panel, l.p_load_avg as p_load, (l.flags & 1) = 1 as cut
    from systems s
    join communities c on c.id = s.community_id
    join v_system_status st on st.system_id = s.id
    join v_health h on h.system_id = s.id
    left join v_latest l on l.system_id = s.id
    where s.id = $1`, [id]);
}

export type Range = "15m" | "1h" | "24h" | "7d" | "30d";

export type SeriesPoint = { ts: string; soc: number; v_bat: number; p_panel: number; p_load: number; t_bat: number; rh: number; v_mid: number };

// 15 min e 1 h: pontos de 5 s (o ESP32 manda a cada poucos segundos; casas simuladas têm um ponto a cada 15 min).
// 24 h: médias de 5 min; 7 d: médias de 1 h; 30 d: médias de 4 h.
export async function getSeries(systemId: number, range: Range): Promise<SeriesPoint[]> {
  const cfg = {
    "15m": ["15 minutes", "5 seconds"], "1h": ["1 hour", "5 seconds"],
    "24h": ["24 hours", "5 minutes"], "7d": ["7 days", "1 hour"], "30d": ["30 days", "4 hours"],
  }[range];
  return sql<SeriesPoint>(`
    select to_char(date_bin($3::interval, ts, timestamptz '2000-01-01') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as ts,
      round(avg(soc)::numeric, 1)::float as soc, round(avg(v_bat_avg)::numeric, 2)::float as v_bat,
      round(avg(p_panel_avg)::numeric, 1)::float as p_panel, round(avg(p_load_avg)::numeric, 1)::float as p_load,
      round(max(t_bat_max)::numeric, 1)::float as t_bat,
      round(avg(rh_box)::numeric, 1)::float as rh, round(avg(v_mid_delta)::numeric, 3)::float as v_mid
    from telemetry
    where system_id = $1 and ts > (select last_seen from systems where id = $1) - $2::interval
    group by 1 order by 1`, [systemId, cfg[0], cfg[1]]);
}

export async function getHealthHistory(systemId: number) {
  return sql<{ day: string; health: number; rint_mohm: number | null; pr: number | null }>(
    "select day, health, rint_mohm, pr from v_health_daily where system_id = $1 order by day", [systemId]);
}

export async function getEvents(systemId: number) {
  return sql<{ ts: Date; kind: string; detail: string | null }>(
    "select ts, kind, detail from events where system_id = $1 and kind <> 'carga_completa' order by ts desc limit 20", [systemId]);
}

export async function getSystemTickets(systemId: number) {
  return sql<TicketRow>(`${TICKET_SELECT} where a.system_id = $1 order by t.created_at desc limit 10`, [systemId]);
}

export async function getCommunity(slug: string) {
  return sqlOne<{
    id: number; slug: string; name: string; municipality: string; lat: number; lon: number; agent_name: string | null;
    agent_phone: string | null; hub_last_seen: Date | null; boat_next_trip: string | null; status: Severity;
    irr_today: number | null; irr_7d: number | null;
  }>(`
    select c.*, cs.status,
      (select kwh_m2 from hub_irradiance h where h.community_id = c.id and h.day = local_day((select app_now()))) as irr_today,
      (select avg(kwh_m2) from hub_irradiance h where h.community_id = c.id and h.day > local_day((select app_now())) - 7) as irr_7d
    from communities c join v_community_status cs on cs.community_id = c.id where c.slug = $1`, [slug]);
}

export async function getIrradianceDays(communityId: number) {
  return sql<{ day: string; kwh_m2: number }>(
    "select day, kwh_m2 from hub_irradiance where community_id = $1 and day > local_day((select app_now())) - 14 order by day", [communityId]);
}

export async function getLogistics(communityId?: number) {
  return sql<{ id: number; community: string; community_slug: string; community_id: number; boat_next_trip: string | null; item: string; qty: number; status: string }>(`
    select li.id, c.name as community, c.slug as community_slug, c.id as community_id, c.boat_next_trip, li.item, li.qty, li.status
    from logistics_items li join communities c on c.id = li.community_id
    where ($1::int is null or li.community_id = $1)
    order by c.boat_next_trip nulls last, c.name, li.status, li.item`, [communityId ?? null]);
}

export async function getImpact() {
  return (await sqlOne<{
    kwh_30d: number; diesel_l_30d: number; co2_kg_30d: number; battery_life_years: number; battery_age_years: number;
    tickets_resolved_30d: number; tickets_verified_30d: number; systems: number; communities: number; l_per_kwh: number; kg_per_l: number;
  }>("select * from mv_impact"))!;
}

export async function getDailyGeneration() {
  return sql<{ day: string; kwh: number; irr: number }>(`
    select d.day, sum(d.e_gen_wh) / 1000 as kwh, (select avg(kwh_m2) from hub_irradiance h where h.day = d.day) as irr
    from v_daily d where d.day > local_day((select app_now())) - 30 group by d.day order by d.day`);
}

// Telas do agente local e do morador
export async function getAgentTasks(communityId: number) {
  return sql<TicketRow & { current_step: number; steps_total: number; minutes: number | null }>(`
    ${TICKET_SELECT.replace("select t.id,", "select t.current_step, jsonb_array_length(pr.steps) as steps_total, pr.minutes, t.id,")}
    where a.community_id = $1 and t.status = 'aguardando_acao_local'
    order by severity_rank(a.severity) desc, t.updated_at`, [communityId]);
}

export async function getHomeView(systemId: number) {
  const sys = await getSystem(systemId);
  if (!sys) return null;
  const appliances = await sql<{ kind: string; label: string; watts: number; essential: boolean }>(
    "select kind, label, watts, essential from appliances where system_id = $1 order by essential desc, watts", [systemId]);
  const forecast = await sql<{ day: string; kwh_m2: number }>(
    "select day, kwh_m2 from hub_forecast where community_id = $1 order by day limit 3", [sys.community_id]);
  return { sys, appliances, forecast };
}

export async function getProfiles() {
  return sql<{ email: string; display_name: string; role: string; community_id: number | null; community: string | null; system_id: number | null; house_number: number | null; active: boolean }>(`
    select p.email, p.display_name, p.role, p.community_id, c.name as community, p.system_id, s.house_number, p.active
    from profiles p left join communities c on c.id = p.community_id left join systems s on s.id = p.system_id
    order by p.role, p.display_name`);
}

// Pedidos de ajuda (morador → agente e engenharia; agente → engenharia)
export type HelpRequest = {
  id: number; community_id: number; community: string; community_slug: string; system_id: number | null;
  house_number: number | null; family_name: string | null; requester_email: string; requester_name: string;
  requester_role: "morador" | "agente"; target: "agente_engenharia" | "engenharia"; reason: string; note: string | null;
  status: "aberto" | "em_atendimento" | "resolvido"; handled_by_name: string | null; response: string | null;
  created_at: Date; updated_at: Date; resolved_at: Date | null;
};

export async function getHelpRequests(opts: { communityId?: number; requesterEmail?: string; includeResolvedDays?: number } = {}) {
  return sql<HelpRequest>(`
    select h.id, h.community_id, c.name as community, c.slug as community_slug, h.system_id, s.house_number, s.family_name,
      h.requester_email, rp.display_name as requester_name, h.requester_role, h.target, h.reason, h.note, h.status,
      hp.display_name as handled_by_name, h.response, h.created_at, h.updated_at, h.resolved_at
    from help_requests h
    join communities c on c.id = h.community_id
    join profiles rp on rp.email = h.requester_email
    left join profiles hp on hp.email = h.handled_by_email
    left join systems s on s.id = h.system_id
    where ($1::int is null or h.community_id = $1)
      and ($2::text is null or h.requester_email = $2)
      and (h.status <> 'resolvido' or h.resolved_at > (select app_now()) - make_interval(days => $3))
    order by case h.status when 'aberto' then 0 when 'em_atendimento' then 1 else 2 end, h.created_at desc`,
    [opts.communityId ?? null, opts.requesterEmail ?? null, opts.includeResolvedDays ?? 7]);
}
