import type { Metadata } from "next";
import { markContactHandled } from "@/app/actions";
import { sql } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Mensagens de contato" };

const AUDIENCE: Record<string, string> = {
  comunidade: "Comunidade", concessionaria: "Concessionária", governo: "Governo ou programa", outro: "Outro",
};

export default async function ContactsPage() {
  await requireRole("coordenador");
  const messages = await sql<{ id: number; name: string; email: string; organization: string | null; audience: string; message: string; created_at: Date; handled: boolean }>(
    "select * from contact_messages order by handled, created_at desc limit 200");
  return (
    <>
      <div>
        <h1 style={{ fontSize: 30 }}>Mensagens de contato</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>Mensagens enviadas pela página de contato. A resposta vai pelo e-mail de cada pessoa.</p>
      </div>
      <div className="stack" style={{ gap: 12, maxWidth: 900 }}>
        {messages.map((m) => (
          <article key={m.id} className="card" style={{ padding: "14px 18px", opacity: m.handled ? 0.65 : 1 }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
              <div>
                <b style={{ fontSize: 16 }}>{m.name}</b>{m.organization ? <span className="muted"> · {m.organization}</span> : null}
                <div style={{ fontSize: 13.5 }}><a href={`mailto:${m.email}`}>{m.email}</a> · <span className="chip" style={{ background: "var(--sage)" }}>{AUDIENCE[m.audience]}</span></div>
              </div>
              <span className="num muted" style={{ fontSize: 12 }}>{dateTime(m.created_at)}</span>
            </div>
            <p style={{ whiteSpace: "pre-wrap", margin: "10px 0" }}>{m.message}</p>
            <form action={markContactHandled.bind(null, m.id, !m.handled)}>
              <button className="btn small">{m.handled ? "Marcar como pendente" : "Marcar como respondida"}</button>
            </form>
          </article>
        ))}
        {!messages.length && <p className="muted">Nenhuma mensagem ainda.</p>}
      </div>
    </>
  );
}
