import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TimeChart } from "@/components/Chart";
import { AutoRefresh } from "@/components/AutoRefresh";
import { StatusChip } from "@/components/Status";
import { ago, dateShort, dateTime, num, pct, TICKET_STATUS } from "@/lib/format";
import { getEvents, getHealthHistory, getNow, getSeries, getSystem, getSystemTickets, type Range } from "@/lib/queries";

export const metadata: Metadata = { title: "Sistema" };

const EVENT_LABEL: Record<string, string> = {
  corte_carga: "Corte de cargas não essenciais",
  religamento: "Cargas religadas",
  reinicio_no: "Nó reiniciado",
  intervencao: "Intervenção registrada",
};

export default async function SystemPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ periodo?: string }>;
}) {
  const { id } = await params;
  const { periodo } = await searchParams;
  const RANGES: Range[] = ["15m", "1h", "24h", "7d", "30d"];
  const range: Range = RANGES.includes(periodo as Range) ? (periodo as Range) : "24h";
  const systemId = Number(id);
  if (!Number.isInteger(systemId)) notFound();

  const [sys, now] = await Promise.all([getSystem(systemId), getNow()]);
  if (!sys) notFound();
  const [series, history, events, tickets] = await Promise.all([
    getSeries(systemId, range), getHealthHistory(systemId), getEvents(systemId), getSystemTickets(systemId),
  ]);

  const fmt = range === "15m" || range === "1h"
    ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Manaus" })
    : range === "24h"
    ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Manaus" })
    : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", timeZone: "America/Manaus" });
  const labels = series.map((p) => fmt.format(new Date(p.ts)));

  // Quanto cada fator tira do índice de saúde (mesmos tetos de v_health).
  const factors = [
    { l: "Resistência interna", v: sys.rint_ratio ? `${num(sys.rint_mohm, 1)} mΩ (${sys.rint_ratio >= 1 ? "+" : ""}${num((sys.rint_ratio - 1) * 100, 0)}%)` : "—",
      p: Math.min(35, Math.max(0, (sys.rint_ratio ?? 1) - 1) * 60), max: 35 },
    { l: "Horas abaixo de 50% (30 d)", v: `${num(sys.h_below_50_30d, 0)} h`, p: Math.min(20, sys.h_below_50_30d / 5), max: 20 },
    { l: "Horas acima de 40 °C (30 d)", v: `${num(sys.h_above_40_30d, 0)} h`, p: Math.min(15, sys.h_above_40_30d / 2), max: 15 },
    { l: "Dias sem carga completa", v: sys.days_since_full >= 31 ? "mais de 30" : `${sys.days_since_full}`, p: Math.min(10, Math.max(0, sys.days_since_full - 1) * 2), max: 10 },
    { l: "Desempenho do painel (PR 7 d)", v: pct(sys.pr_7d), p: Math.min(15, Math.max(0, 0.85 - (sys.pr_7d ?? 0.85)) * 100), max: 15 },
    { l: "Energia acumulada / vida nominal", v: pct(sys.throughput_ratio), p: Math.min(5, sys.throughput_ratio * 5), max: 5 },
  ];

  return (
    <>
      <nav aria-label="Caminho" className="eyebrow">
        <Link href="/painel">Visão geral</Link> / <Link href={`/painel/comunidade/${sys.community_slug}`}>{sys.community}</Link> / Casa {sys.house_number}
      </nav>
      <div className="row" style={{ alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 32 }}>Casa {sys.house_number} · família {sys.family_name}</h1>
          <div className="row" style={{ gap: 8, marginTop: 6, alignItems: "center" }}>
            <StatusChip status={sys.status} />
            <span className="muted" style={{ fontSize: 13 }}>último pacote {ago(sys.last_seen, now)}{sys.cut ? " · corte de carga ativo" : ""}</span>
            <AutoRefresh seconds={10} />
          </div>
        </div>
        <div className="seg" role="group" aria-label="Período dos gráficos">
          {RANGES.map((r) => (
            <Link key={r} href={`?periodo=${r}`} aria-current={range === r ? "true" : undefined} scroll={false}>
              {{ "15m": "15 min", "1h": "1 h", "24h": "24 h", "7d": "7 dias", "30d": "30 dias" }[r]}
            </Link>
          ))}
        </div>
      </div>

      {(range === "15m" || range === "1h") && series.length < 4 && (
        <p className="muted" style={{ margin: 0, fontSize: 13.5, background: "var(--paper-3)", padding: "8px 12px", borderRadius: 8 }}>
          Esta casa não mandou dados de poucos segundos nesse período. As janelas de 15 min e 1 h servem para nós que enviam
          com frequência, como o da bancada; para as demais, use 24 h ou mais.
        </p>
      )}

      <section className="kpis" aria-label="Leituras atuais">
        {[
          { l: "Índice de saúde", v: `${sys.health}`, u: "/ 100" },
          { l: "Estado de carga", v: num(sys.soc, 0), u: "%" },
          { l: "Tensão do banco", v: num(sys.v_bat, 2), u: "V" },
          { l: "Temperatura bateria", v: num(sys.t_bat, 1), u: "°C" },
          { l: "Painel agora", v: num(sys.p_panel, 0), u: "W" },
          { l: "Consumo agora", v: num(sys.p_load, 0), u: "W" },
          { l: "Umidade da caixa", v: num(sys.rh_box, 0), u: "%" },
          { l: "Ponto médio ΔV", v: num(sys.v_mid_delta, 2), u: "V" },
        ].map((k) => (
          <div className="kpi" key={k.l}><div className="l">{k.l}</div><div className="v">{k.v}<small>{k.u}</small></div></div>
        ))}
      </section>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="grow stack">
          <section className="card">
            <div className="card-h"><h2>Bateria</h2><span className="eyebrow">estado de carga e tensão</span></div>
            <div className="card-b">
              <TimeChart tall labels={labels} unit="%" min={0} max={100}
                series={[
                  { label: "SoC", data: series.map((p) => p.soc), color: "#0B4D3B", fill: "rgba(214,235,200,0.55)" },
                  { label: "Tensão do banco", data: series.map((p) => p.v_bat), color: "#1E2A22", dashed: true, axis: "y2" },
                ]}
                thresholds={[{ value: 50, label: "corte 50%", color: "#B08A2E" }]}
                y2={{ min: 11 * (sys.bank_nominal_v / 12), max: 14.5 * (sys.bank_nominal_v / 12), unit: "V" }} />
            </div>
          </section>
          <section className="card">
            <div className="card-h"><h2>Energia</h2><span className="eyebrow">potência do painel e consumo</span></div>
            <div className="card-b">
              <TimeChart labels={labels} unit="W" min={0}
                series={[
                  { label: "Painel", data: series.map((p) => p.p_panel), color: "#B08A2E", fill: "rgba(241,217,160,0.55)" },
                  { label: "Consumo", data: series.map((p) => p.p_load), color: "#1E2A22" },
                ]} />
            </div>
          </section>
          <section className="card">
            <div className="card-h"><h2>Temperatura da bateria</h2><span className="eyebrow">máxima de cada intervalo</span></div>
            <div className="card-b">
              <TimeChart labels={labels} unit="°C" series={[{ label: "T bateria", data: series.map((p) => p.t_bat), color: "#B5482F" }]}
                thresholds={[{ value: 45, label: "alerta 45 °C", color: "#B5482F" }, { value: 40, label: "estresse 40 °C", color: "#B08A2E" }]} />
            </div>
          </section>
          <section className="card">
            <div className="card-h"><h2>Evolução da saúde</h2><span className="eyebrow">30 dias · índice e resistência interna</span></div>
            <div className="card-b">
              <TimeChart labels={history.map((h) => dateShort(h.day))} min={0} max={100}
                series={[
                  { label: "Índice de saúde", data: history.map((h) => h.health), color: "#0B4D3B" },
                  { label: "Rint (mΩ)", data: history.map((h) => h.rint_mohm), color: "#B5482F", dashed: true, axis: "y2" },
                ]}
                thresholds={[]} y2={{ unit: "mΩ" }} />
            </div>
          </section>
        </div>

        <div className="side stack">
          <section className="card">
            <div className="card-h"><h2>De onde vem o índice</h2><span className="num" style={{ fontSize: 20 }}>{sys.health}</span></div>
            <table className="dense" style={{ fontSize: 13 }}>
              <tbody>
                {factors.map((f) => (
                  <tr key={f.l}>
                    <td style={{ whiteSpace: "normal" }}>{f.l}<div className="muted num" style={{ fontSize: 11.5 }}>{f.v}</div></td>
                    <td className="r num" style={{ color: f.p >= f.max * 0.5 ? "var(--crit-ink)" : f.p > 0.5 ? "var(--warn-ink)" : "var(--muted)" }}>
                      −{num(f.p, 0)}<span className="muted"> / {f.max}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="card-b muted" style={{ fontSize: 12 }}>
              Capacidade efetiva: {sys.capacity_ah ? <b className="num">{num(sys.capacity_ah, 0)} Ah</b> : "sem descarga profunda nos últimos 30 dias"}
            </div>
          </section>

          <section className="card">
            <div className="card-h"><h2>Equipamento</h2></div>
            <dl className="card-b" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", margin: 0, fontSize: 13.5 }}>
              <dt className="muted">Baterias</dt><dd style={{ margin: 0 }}>{sys.battery_count}× {sys.battery_model} · {sys.battery_chemistry}</dd>
              <dt className="muted">Banco</dt><dd style={{ margin: 0 }} className="num">{num(sys.bank_nominal_v, 0)} V · {num(sys.bank_nominal_ah, 0)} Ah</dd>
              <dt className="muted">Painéis</dt><dd style={{ margin: 0 }} className="num">{sys.panel_count}× {num(sys.panel_wp, 0)} Wp</dd>
              <dt className="muted">Instalação</dt><dd style={{ margin: 0 }} className="num">{dateShort(sys.installed_on)}/{sys.installed_on.slice(0, 4)}</dd>
              <dt className="muted">R<sub>int</sub> inicial</dt><dd style={{ margin: 0 }} className="num">{num(sys.rint_initial_mohm, 1)} mΩ</dd>
              <dt className="muted">Agente local</dt><dd style={{ margin: 0 }}>{sys.agent_name}</dd>
            </dl>
          </section>

          <section className="card">
            <div className="card-h"><h2>Chamados</h2></div>
            <ul className="dashed" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {tickets.map((t) => (
                <li key={t.id} style={{ padding: "8px 14px", fontSize: 13 }}>
                  <Link href={`/painel/chamados/${t.id}`} style={{ fontWeight: 600 }}>#{t.id} {t.title}</Link>
                  <div className="muted" style={{ fontSize: 12 }}>{TICKET_STATUS[t.status]} · {dateTime(t.created_at)}</div>
                </li>
              ))}
              {!tickets.length && <li className="muted" style={{ padding: 14 }}>Nenhum chamado.</li>}
            </ul>
          </section>

          <section className="card">
            <div className="card-h"><h2>Registro de eventos</h2></div>
            <ul className="dashed" style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 280, overflowY: "auto" }}>
              {events.map((e, i) => (
                <li key={i} style={{ padding: "7px 14px", fontSize: 13, display: "flex", gap: 10 }}>
                  <span className="num muted" style={{ fontSize: 11.5, minWidth: 82 }}>{dateTime(e.ts)}</span>
                  <span>{EVENT_LABEL[e.kind] ?? e.kind}{e.detail ? <span className="muted"> · {e.detail}</span> : null}</span>
                </li>
              ))}
              {!events.length && <li className="muted" style={{ padding: 14 }}>Sem eventos.</li>}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
