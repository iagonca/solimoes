import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { assumeTicket, saveDiagnosis, setTicketStatus } from "@/app/actions";
import { TimeChart } from "@/components/Chart";
import { StatusChip } from "@/components/Status";
import { ago, dateTime, num, TICKET_STATUS } from "@/lib/format";
import { getNow, getProtocols, getSeries, getTicket, type SeriesPoint } from "@/lib/queries";
import { getProfile } from "@/lib/session";

export const metadata: Metadata = { title: "Chamado" };

// Qual grandeza ajuda a analisar cada regra.
const METRIC: Record<string, { key: keyof SeriesPoint; label: string; unit: string; threshold?: number; color: string }> = {
  temp_alta: { key: "t_bat", label: "Temperatura da bateria", unit: "°C", threshold: 45, color: "#B5482F" },
  soc_baixo: { key: "soc", label: "Estado de carga", unit: "%", threshold: 50, color: "#0B4D3B" },
  corte_carga: { key: "v_bat", label: "Tensão do banco", unit: "V", threshold: 23, color: "#1E2A22" },
  pr_baixo: { key: "p_panel", label: "Potência do painel", unit: "W", color: "#B08A2E" },
  rint_alta: { key: "v_bat", label: "Tensão do banco", unit: "V", color: "#1E2A22" },
  desequilibrio: { key: "v_mid", label: "Desequilíbrio no ponto médio", unit: "V", threshold: 0.3, color: "#B08A2E" },
  umidade: { key: "rh", label: "Umidade da caixa", unit: "%", threshold: 85, color: "#3E6F86" },
};

const EVENT: Record<string, string> = {
  aberto: "Chamado aberto", em_analise: "Em análise", diagnostico: "Diagnóstico", aguardando_acao_local: "Protocolo enviado",
  passo: "Passo feito", resolvido: "Resolvido", verificacao: "Verificação automática", alerta_normalizado: "Alerta normalizou",
  pedido_ajuda: "Agente pediu ajuda",
};

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [data, protocols, now, me] = await Promise.all([getTicket(id), getProtocols(), getNow(), getProfile()]);
  if (!data) notFound();
  const { ticket: t, events, messages } = data;
  const metric = METRIC[t.rule];
  const series = t.system_id && metric ? await getSeries(t.system_id, "7d") : [];
  const fmt = new Intl.DateTimeFormat("pt-BR", { weekday: "short", hour: "2-digit", timeZone: "America/Manaus" });
  const mine = t.assignee_email === me?.email;
  const open = t.status !== "resolvido";

  return (
    <>
      <nav aria-label="Caminho" className="eyebrow"><Link href="/painel/chamados">Chamados</Link> / #{t.id}</nav>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: 30 }}>{t.title}</h1>
          <div className="row" style={{ gap: 8, marginTop: 6, alignItems: "center" }}>
            <StatusChip status={t.severity} />
            <span className="chip" style={{ background: "var(--paper-3)" }}>{TICKET_STATUS[t.status]}</span>
            <span className="muted" style={{ fontSize: 13 }}>
              {t.community}{t.house_number ? <> · <Link href={`/painel/sistema/${t.system_id}`}>Casa {t.house_number}</Link></> : " · hub"} · aberto {ago(t.created_at, now)}
              {t.assignee_name ? ` · com ${t.assignee_name}` : " · sem dono"}
            </span>
          </div>
        </div>
        {open && (
          <div className="row" style={{ gap: 8 }}>
            {!mine && <form action={assumeTicket.bind(null, t.id)}><button className="btn primary">Assumir chamado</button></form>}
            {t.status !== "em_analise" && <form action={setTicketStatus.bind(null, t.id, "em_analise")}><button className="btn">Voltar para análise</button></form>}
            <form action={setTicketStatus.bind(null, t.id, "resolvido")}><button className="btn">Marcar resolvido</button></form>
          </div>
        )}
      </div>

      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="grow stack">
          <section className="card">
            <div className="card-h"><h2>O que os dados mostram</h2><span className="eyebrow">últimos 7 dias</span></div>
            <div className="card-b">
              <p style={{ marginTop: 0 }}>
                Ação sugerida pela regra: <b>{t.action}</b>
                {t.value !== null && <> · valor que disparou: <span className="num">{num(t.value, t.rule === "rint_alta" ? 2 : 1)}{t.rule === "rint_alta" ? "× a inicial" : ""}</span></>}
              </p>
              {metric && series.length > 0 && (
                <TimeChart labels={series.map((p) => fmt.format(new Date(p.ts)))} unit={metric.unit}
                  series={[{ label: metric.label, data: series.map((p) => p[metric.key] as number), color: metric.color }]}
                  thresholds={metric.threshold !== undefined ? [{ value: metric.threshold, label: "limite da regra", color: "#B5482F" }] : []} />
              )}
              {!t.system_id && <p className="muted">O alerta vale para a comunidade inteira: nenhuma casa manda dados desde que o hub parou.</p>}
            </div>
          </section>

          {open ? (
            <section className="card">
              <div className="card-h"><h2>Diagnóstico e protocolo</h2></div>
              <form action={saveDiagnosis} className="card-b stack">
                <input type="hidden" name="id" value={t.id} />
                <label className="field">Diagnóstico (fica no histórico do sistema)
                  <textarea className="input" name="diagnosis" defaultValue={t.diagnosis ?? ""} placeholder="O que os gráficos indicam e por quê." />
                </label>
                <label className="field">Protocolo de correção para o agente local
                  <select className="input" name="protocol" defaultValue={t.protocol_code ?? ""}>
                    <option value="">Nenhum ainda</option>
                    {protocols.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.title} ({p.minutes} min)</option>)}
                  </select>
                </label>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn" name="send" value="0">Salvar</button>
                  <button className="btn primary" name="send" value="1">Salvar e enviar ao agente local</button>
                </div>
              </form>
            </section>
          ) : (
            <section className="card">
              <div className="card-h"><h2>Resultado</h2></div>
              <div className="card-b">
                <p style={{ marginTop: 0 }}>{t.diagnosis ?? "Sem diagnóstico registrado."}</p>
                <p style={{ marginBottom: 0 }}>
                  {t.verified_improved === null ? "O sistema confere os dados 6 h depois da intervenção, e esse prazo ainda não passou." :
                    t.verified_improved ? "✓ Os dados melhoraram depois da intervenção." : "Os dados não melhoraram depois da intervenção."}
                </p>
              </div>
            </section>
          )}
        </div>

        <div className="side stack">
          <section className="card">
            <div className="card-h"><h2>Histórico</h2></div>
            <ol className="dashed" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {events.map((e, i) => (
                <li key={i} style={{ padding: "8px 14px", fontSize: 13 }}>
                  <div className="num muted" style={{ fontSize: 11 }}>{dateTime(e.ts)} · {e.actor}</div>
                  <b>{EVENT[e.kind] ?? e.kind}</b>{e.note ? <div style={{ color: "var(--ink-2)" }}>{e.note}</div> : null}
                </li>
              ))}
            </ol>
          </section>
          <section className="card">
            <div className="card-h"><h2>Mensagens ao agente</h2><span className="eyebrow">WhatsApp via hub</span></div>
            <ul className="dashed" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {messages.map((m, i) => (
                <li key={i} style={{ padding: "8px 14px", fontSize: 13 }}>
                  <div className="num muted" style={{ fontSize: 11 }}>{dateTime(m.queued_at)} · {m.sent_at ? "enviada" : "na fila até o hub voltar"}</div>
                  {m.body}
                </li>
              ))}
              {!messages.length && <li className="muted" style={{ padding: 14, fontSize: 13 }}>Nenhuma mensagem enviada.</li>}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
