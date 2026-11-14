import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart } from "@/components/Chart";
import { MapView } from "@/components/MapView";
import { HealthBar, StatusChip, StatusGlyph } from "@/components/Status";
import { ago, dateShort, num } from "@/lib/format";
import { getCommunities, getCommunity, getIrradianceDays, getLogistics, getNow, getOpenAlerts, getSystems } from "@/lib/queries";

export const metadata: Metadata = { title: "Comunidade" };

export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await getCommunity(slug);
  if (!c) notFound();
  const [now, systems, alerts, irr, logistics, communities] = await Promise.all([
    getNow(), getSystems({ communityId: c.id }), getOpenAlerts(c.id), getIrradianceDays(c.id), getLogistics(c.id), getCommunities(),
  ]);
  const gen = systems.reduce((a, s) => a + (s.e_gen_today_wh ?? 0), 0) / 1000;
  const load = systems.reduce((a, s) => a + (s.e_load_today_wh ?? 0), 0) / 1000;
  const health = Math.round(systems.reduce((a, s) => a + s.health, 0) / Math.max(1, systems.length));
  const hubOnline = c.hub_last_seen && new Date(now).getTime() - new Date(c.hub_last_seen).getTime() < 2 * 3600_000;

  return (
    <>
      <nav aria-label="Caminho" className="eyebrow"><Link href="/painel">Visão geral</Link> / {c.name}</nav>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: 32 }}>{c.name}</h1>
          <div className="row" style={{ gap: 8, marginTop: 6, alignItems: "center" }}>
            <StatusChip status={c.status} />
            <span className="muted" style={{ fontSize: 13 }}>{c.municipality} · hub {hubOnline ? "no ar" : `sem comunicar ${ago(c.hub_last_seen, now)}`}</span>
          </div>
        </div>
        <div className="card" style={{ padding: "10px 14px", fontSize: 14 }}>
          <div className="eyebrow">Agente local</div>
          <b>{c.agent_name}</b> · <span className="num">{c.agent_phone}</span>
        </div>
      </div>

      <section className="kpis">
        {[
          { l: "Casas", v: `${systems.length}`, u: "" },
          { l: "Saúde média", v: `${health}`, u: "/ 100" },
          { l: "Gerado hoje", v: num(gen, 1), u: "kWh" },
          { l: "Consumido hoje", v: num(load, 1), u: "kWh" },
          { l: "Irradiação hoje (hub)", v: num(c.irr_today, 1), u: "kWh/m²" },
          { l: "Média de 7 dias", v: num(c.irr_7d, 1), u: "kWh/m²" },
          { l: "Próximo barco", v: c.boat_next_trip ? dateShort(c.boat_next_trip) : "—", u: "" },
        ].map((k) => <div className="kpi" key={k.l}><div className="l">{k.l}</div><div className="v">{k.v}<small>{k.u}</small></div></div>)}
      </section>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <section className="card grow">
          <div className="card-h"><h2>Casas</h2></div>
          <div className="table-box">
            <table className="dense">
              <thead><tr><th>Casa</th><th>Família</th><th>Saúde</th><th className="r">SoC</th><th className="r">Gerado hoje</th><th className="r">Consumido hoje</th><th className="r">T bat</th><th className="r">Último</th></tr></thead>
              <tbody>
                {systems.sort((a, b) => a.house_number - b.house_number).map((s) => (
                  <tr key={s.id} className={s.status === "vermelho" ? "crit" : undefined}>
                    <td><StatusGlyph status={s.status} size={20} /> <Link href={`/painel/sistema/${s.id}`}>Casa {s.house_number}</Link></td>
                    <td>{s.family_name}</td>
                    <td><HealthBar value={s.health} status={s.status} /></td>
                    <td className="r num">{s.soc === null ? "—" : `${num(s.soc, 0)}%`}</td>
                    <td className="r num">{num((s.e_gen_today_wh ?? 0) / 1000, 2)} kWh</td>
                    <td className="r num">{num((s.e_load_today_wh ?? 0) / 1000, 2)} kWh</td>
                    <td className="r num">{num(s.t_bat, 1)} °C</td>
                    <td className="r num muted">{s.last_seen ? ago(s.last_seen, now) : "sem dados ainda"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <div className="side stack">
          <section style={{ height: 300 }}>
            <MapView communities={communities} systems={systems} focus={{ lat: c.lat, lon: c.lon }} />
          </section>
          <section className="card">
            <div className="card-h"><h2>Sol medido no hub</h2><span className="eyebrow">14 dias</span></div>
            <div className="card-b"><BarChart labels={irr.map((d) => dateShort(d.day))} values={irr.map((d) => +d.kwh_m2.toFixed(2))} color="#E3B341" unit="kWh/m²" /></div>
          </section>
        </div>
      </div>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <section className="card grow">
          <div className="card-h"><h2>Alertas abertos</h2></div>
          <ul className="dashed" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {alerts.map((a) => (
              <li key={a.id} style={{ display: "flex", gap: 10, padding: "9px 14px", alignItems: "center" }}>
                <StatusGlyph status={a.severity} size={22} />
                <Link href={`/painel/chamados/${a.ticket_id}`} style={{ fontWeight: 600 }}>{a.title}</Link>
                <span className="muted" style={{ fontSize: 13 }}>{a.house_number ? `Casa ${a.house_number}` : "hub"} · {ago(a.opened_at, now)}</span>
              </li>
            ))}
            {!alerts.length && <li className="muted" style={{ padding: 14 }}>Nenhum alerta aberto.</li>}
          </ul>
        </section>
        <section className="card side">
          <div className="card-h"><h2>Para a próxima viagem</h2></div>
          <ul className="dashed" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {logistics.map((l) => (
              <li key={l.id} style={{ padding: "8px 14px", fontSize: 13.5, display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>{l.qty}× {l.item}</span><span className="muted">{l.status}</span>
              </li>
            ))}
            {!logistics.length && <li className="muted" style={{ padding: 14 }}>Nada pendente.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}
