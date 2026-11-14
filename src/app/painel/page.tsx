import type { Metadata } from "next";
import Link from "next/link";
import { TimeChart } from "@/components/Chart";
import { MapView } from "@/components/MapView";
import { HealthBar, Sparkline, StatusGlyph } from "@/components/Status";
import { TicketLanes } from "@/components/TicketLanes";
import { ago, clock, num, pct, SEVERITY } from "@/lib/format";
import { getCommunities, getKpis, getNow, getOpenAlerts, getSeries, getSystems, getTickets } from "@/lib/queries";

export const metadata: Metadata = { title: "Visão geral" };

export default async function Overview({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const { filtro } = await searchParams;
  const [now, kpis, communities, alerts, systems, tickets] = await Promise.all([
    getNow(), getKpis(), getCommunities(), getOpenAlerts(), getSystems(), getTickets(),
  ]);
  const focus = systems[0];
  const healthAvg = Math.round(systems.reduce((a, s) => a + s.health, 0) / Math.max(1, systems.length));
  const series = focus ? await getSeries(focus.id, "7d") : [];
  const counts = { vermelho: 0, amarelo: 0, cinza: 0, verde: 0 };
  for (const s of systems) counts[s.status]++;
  const shown = filtro && filtro in counts ? systems.filter((s) => s.status === filtro) : systems;

  const kpiList = [
    { l: "Nós comunicando", v: `${kpis.online}`, u: `/ ${kpis.systems}`, n: kpis.systems - kpis.online ? `${kpis.systems - kpis.online} offline` : "todos no ar" },
    { l: "Gerado hoje", v: num(kpis.e_gen_today_kwh, 1), u: "kWh", n: `até ${clock(now)}` },
    { l: "Consumido hoje", v: num(kpis.e_load_today_kwh, 1), u: "kWh", n: "I_carga = I_painel − I_bateria" },
    { l: "Irradiação nos hubs", v: num(kpis.irr_today, 1), u: "kWh/m²", n: "média das células de referência" },
    { l: "PR médio (7 d)", v: pct(kpis.pr_avg), u: "", n: "só intervalos em bulk" },
    { l: "Saúde média", v: `${healthAvg}`, u: "/ 100", n: `${counts.vermelho + counts.amarelo} sistemas pedem atenção` },
    { l: "Diesel evitado (30 d)", v: num(kpis.diesel_l_30d, 0), u: "L", n: `${num(kpis.co2_kg_30d / 1000, 2)} t de CO₂` },
    { l: "Chamados abertos", v: `${kpis.tickets_open}`, u: "", n: `${kpis.tickets_resolved_30d} resolvidos em 30 d` },
  ];

  return (
    <>
      <div className="row" style={{ alignItems: "flex-end", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 30 }}>
          {communities.length} comunidades, {kpis.systems} casas
          {kpis.alerts_red ? `, ${kpis.alerts_red} ${kpis.alerts_red === 1 ? "alerta crítico" : "alertas críticos"}` : ""}
        </h1>
        <span className="muted" style={{ fontSize: 13 }}>Último pacote recebido {ago(now, now)} · {clock(now)}</span>
      </div>

      <section aria-label="Indicadores" className="kpis">
        {kpiList.map((k) => (
          <div className="kpi" key={k.l}>
            <div className="l">{k.l}</div>
            <div className="v">{k.v}{k.u && <small>{k.u}</small>}</div>
            <div className="n">{k.n}</div>
          </div>
        ))}
      </section>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <section className="card grow" aria-label="Sistemas">
          <div className="card-h">
            <h2>Sistemas · ordenados por gravidade e saúde</h2>
            <div className="seg" role="group" aria-label="Filtro de status">
              <Link href="/painel" aria-current={!filtro ? "true" : undefined}>Todos {systems.length}</Link>
              {(["vermelho", "amarelo", "cinza"] as const).map((s) => (
                <Link key={s} href={`/painel?filtro=${s}`} aria-current={filtro === s ? "true" : undefined}>
                  {SEVERITY[s].glyph} {counts[s]}
                </Link>
              ))}
            </div>
          </div>
          <div className="table-box" style={{ maxHeight: 560 }}>
            <table className="dense">
              <thead>
                <tr>
                  <th>Sistema</th><th>Saúde</th><th>SoC 24 h</th><th className="r">SoC</th><th className="r">V banco</th>
                  <th className="r">T bat</th><th className="r">R<sub>int</sub> Δ</th><th className="r">PR 7 d</th>
                  <th className="r">h &lt; 50%</th><th className="r">Último</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id} className={s.status === "vermelho" ? "crit" : undefined}>
                    <td>
                      <span style={{ color: SEVERITY[s.status].bg === "var(--off)" ? "var(--off-ink)" : SEVERITY[s.status].bg, marginRight: 6 }} aria-label={SEVERITY[s.status].label}>{SEVERITY[s.status].glyph}</span>
                      <Link href={`/painel/sistema/${s.id}`}>Casa {s.house_number}</Link>{" "}
                      <span className="muted">{s.community}</span>
                    </td>
                    <td><HealthBar value={s.health} status={s.status} /></td>
                    <td><Sparkline values={s.spark} /></td>
                    <td className="r num">{s.soc === null ? "—" : `${num(s.soc, 0)}%`}</td>
                    <td className="r num">{num(s.v_bat, 2)} V</td>
                    <td className="r num" style={{ color: (s.t_bat ?? 0) > 45 ? "var(--crit)" : undefined }}>{num(s.t_bat, 1)} °C</td>
                    <td className="r num" style={{ color: (s.rint_ratio ?? 1) > 1.5 ? "var(--warn-ink)" : undefined }}>
                      {s.rint_ratio ? `${s.rint_ratio >= 1 ? "+" : ""}${num((s.rint_ratio - 1) * 100, 0)}%` : "—"}
                    </td>
                    <td className="r num" style={{ color: (s.pr_7d ?? 1) < 0.7 ? "var(--warn-ink)" : undefined }}>{pct(s.pr_7d)}</td>
                    <td className="r num">{num(s.h_below_50_30d, 0)} h</td>
                    <td className="r num muted">{s.last_seen ? ago(s.last_seen, now) : "sem dados ainda"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ padding: "8px 16px", fontSize: 11.5, borderTop: "1.5px solid var(--ink)" }}>
            PR = E<sub>gerada</sub> / (H × P<sub>nom</sub>) nos intervalos em bulk · R<sub>int</sub> Δ em relação à medida na instalação · h &lt; 50% nos últimos 30 dias
          </div>
        </section>

        <div className="side stack">
          <section aria-label="Mapa" style={{ height: 320 }}>
            <MapView communities={communities} />
          </section>
          <section className="card" aria-label="Alertas abertos">
            <div className="card-h"><h2>Alertas abertos</h2><span className="eyebrow">por gravidade</span></div>
            <ol className="dashed" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {alerts.map((a) => (
                <li key={a.id} style={{ display: "flex", gap: 10, padding: "9px 14px", alignItems: "flex-start" }}>
                  <StatusGlyph status={a.severity} size={24} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Link href={a.ticket_id ? `/painel/chamados/${a.ticket_id}` : "#"} style={{ fontWeight: 600, fontSize: 13.5, color: "var(--ink)", textDecoration: "none" }}>
                      {a.title}
                    </Link>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {a.community}{a.house_number ? ` · Casa ${a.house_number}` : " · hub"}
                    </div>
                  </div>
                  <span className="num muted" style={{ fontSize: 11 }}>{ago(a.opened_at, now)}</span>
                </li>
              ))}
              {!alerts.length && <li style={{ padding: 14 }} className="muted">Nenhum alerta aberto.</li>}
            </ol>
          </section>
        </div>
      </div>

      {focus && (
        <section className="card" aria-label="Sistema em foco">
          <div className="card-h">
            <h2>
              <StatusGlyph status={focus.status} size={22} />{" "}
              <Link href={`/painel/sistema/${focus.id}`} style={{ color: "var(--ink)" }}>{focus.community} · Casa {focus.house_number}</Link>
              <span className="muted" style={{ fontFamily: "var(--sans)", fontSize: 14, fontWeight: 400 }}> · família {focus.family_name} · últimos 7 dias</span>
            </h2>
            <Link href={`/painel/sistema/${focus.id}`} className="btn small">Abrir sistema</Link>
          </div>
          <div className="card-b" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            <MiniChart title="Estado de carga (%)" labels={series.map((p) => p.ts)} data={series.map((p) => p.soc)} color="#0B4D3B" fill="rgba(214,235,200,0.6)" min={0} max={100} threshold={{ value: 50, label: "corte 50%", color: "#B08A2E" }} />
            <MiniChart title="Temperatura da bateria (°C)" labels={series.map((p) => p.ts)} data={series.map((p) => p.t_bat)} color="#B5482F" threshold={{ value: 45, label: "alerta 45 °C", color: "#B5482F" }} />
            <MiniChart title="Potência do painel (W)" labels={series.map((p) => p.ts)} data={series.map((p) => p.p_panel)} color="#B08A2E" fill="rgba(241,217,160,0.6)" min={0} />
            <MiniChart title="Consumo (W)" labels={series.map((p) => p.ts)} data={series.map((p) => p.p_load)} color="#1E2A22" min={0} />
          </div>
        </section>
      )}

      <section aria-label="Fila de chamados" className="stack" style={{ gap: 10 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ fontSize: 22 }}>A ponte, hoje</h2>
          <Link href="/painel/chamados">Abrir a fila completa →</Link>
        </div>
        <TicketLanes tickets={tickets} now={now} limit={3} />
      </section>
    </>
  );
}

function MiniChart({ title, labels, data, color, fill, min, max, threshold }: {
  title: string; labels: string[]; data: number[]; color: string; fill?: string; min?: number; max?: number;
  threshold?: { value: number; label: string; color: string };
}) {
  const short = labels.map((t) => new Intl.DateTimeFormat("pt-BR", { weekday: "short", hour: "2-digit", timeZone: "America/Manaus" }).format(new Date(t)));
  return (
    <figure style={{ margin: 0 }}>
      <figcaption className="muted" style={{ fontSize: 12.5, marginBottom: 4 }}>{title}</figcaption>
      <TimeChart labels={short} series={[{ label: title, data, color, fill }]} thresholds={threshold ? [threshold] : []} min={min} max={max} />
    </figure>
  );
}
