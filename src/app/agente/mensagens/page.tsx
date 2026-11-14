import type { Metadata } from "next";
import { sql } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Mensagens" };

export default async function MessagesPage() {
  const me = await requireRole("agente");
  const messages = await sql<{ body: string; queued_at: Date; sent_at: Date | null }>(
    "select body, queued_at, sent_at from outbox where community_id = $1 order by queued_at desc limit 30", [me.community_id]);
  return (
    <>
      <header className="phone-head"><h1>Mensagens</h1><p style={{ margin: "4px 0 0", color: "var(--sage)" }}>Mensagens da equipe técnica para a comunidade.</p></header>
      <div className="phone-body">
        {messages.map((m, i) => (
          <div key={i} className="card" style={{ padding: "12px 14px" }}>
            <div className="num muted" style={{ fontSize: 12 }}>{dateTime(m.queued_at)}{m.sent_at ? "" : " · esperando o hub"}</div>
            <div style={{ fontSize: 16 }}>{m.body}</div>
          </div>
        ))}
        {!messages.length && <p className="muted">Nenhuma mensagem ainda.</p>}
      </div>
    </>
  );
}
