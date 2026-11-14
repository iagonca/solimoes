import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { agentConfirm, agentNeedHelp, agentNextStep } from "@/app/actions";
import { SpeakButton } from "@/components/client";
import { Icon } from "@/components/Icon";
import { getProtocol, getTicket } from "@/lib/queries";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Tarefa" };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole("agente");
  const id = Number((await params).id);
  const data = Number.isInteger(id) ? await getTicket(id) : null;
  if (!data || data.ticket.community_id !== me.community_id || !data.ticket.protocol_code) notFound();
  const t = data.ticket;
  const p = (await getProtocol(t.protocol_code!))!;
  const done = Math.min(t.current_step, p.steps.length);
  const finished = done >= p.steps.length;
  const current = finished ? null : p.steps[done];
  const waiting = t.status === "aguardando_acao_local";

  return (
    <>
      <header className="phone-head">
        <Link href="/agente" style={{ color: "var(--sage)", fontSize: 14, textDecoration: "none" }}>← Voltar</Link>
        <div className="eyebrow" style={{ color: "var(--sage)", marginTop: 8 }}>Casa {t.house_number} · {p.code}</div>
        <h1 style={{ fontSize: 26 }}>{p.title}</h1>
        {t.diagnosis && <p style={{ margin: "6px 0 0", color: "var(--sage)", fontSize: 14 }}>{t.assignee_name}: “{t.diagnosis}”</p>}
      </header>
      <div className="phone-body">
        {!waiting && <p role="status" style={{ margin: 0, background: "var(--sage)", padding: 12, borderRadius: 6 }}>Esta tarefa já foi concluída.</p>}

        {waiting && current && (
          <section className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="eyebrow">Passo {done + 1} de {p.steps.length}</span>
              <SpeakButton text={`Passo ${done + 1}. ${current.text}`} label="Ouvir o passo" />
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 8 }}>
              <span className="glyph" style={{ width: 72, height: 72, background: "var(--sage)", color: "var(--forest)" }}><Icon name={current.icon} size={40} /></span>
              <p style={{ margin: 0, fontSize: 20, lineHeight: 1.35 }}>{current.text}</p>
            </div>
            <form action={agentNextStep.bind(null, t.id)} style={{ marginTop: 16 }}>
              <button className="btn primary big">Feito, próximo</button>
            </form>
          </section>
        )}

        {waiting && finished && (
          <section className="card" style={{ padding: 16, textAlign: "center" }}>
            <span className="glyph" style={{ width: 64, height: 64, background: "var(--forest)", color: "var(--paper)", margin: "0 auto" }}><Icon name="check" size={36} /></span>
            <p style={{ fontSize: 20, margin: "12px 0" }}>Todos os passos feitos.</p>
            <form action={agentConfirm.bind(null, t.id)}><button className="btn primary big">Confirmar que terminei</button></form>
          </section>
        )}

        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {p.steps.map((s, i) => (
            <li key={i} className={`step${i < done ? " done" : ""}${i === done && waiting ? " now" : ""}`}>
              <span className="n">{i < done ? "✓" : i + 1}</span>
              <span style={{ fontSize: 16, paddingTop: 4 }}>{s.text}</span>
            </li>
          ))}
        </ol>

        {waiting && (
          <details className="card" style={{ padding: "4px 14px" }}>
            <summary style={{ padding: "12px 0", fontWeight: 600, cursor: "pointer", minHeight: 44 }}>Não consegui fazer</summary>
            <form action={agentNeedHelp} className="stack" style={{ gap: 10, paddingBottom: 14 }}>
              <input type="hidden" name="id" value={t.id} />
              <label className="field">O que aconteceu? (opcional)
                <textarea className="input" name="note" placeholder="Ex.: a caixa está trancada" />
              </label>
              <button className="btn big">Pedir ajuda à engenheira</button>
            </form>
          </details>
        )}
      </div>
    </>
  );
}
