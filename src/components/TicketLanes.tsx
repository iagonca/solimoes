import Link from "next/link";
import { ago, SEVERITY, TICKET_STATUS } from "@/lib/format";
import type { TicketRow } from "@/lib/queries";

const LANES = [
  { key: "aberto", bg: "var(--rose)" },
  { key: "em_analise", bg: "var(--ochre)" },
  { key: "aguardando_acao_local", bg: "var(--sky)" },
  { key: "resolvido", bg: "var(--sage)" },
] as const;

export function TicketLanes({ tickets, now, limit }: { tickets: TicketRow[]; now: Date; limit?: number }) {
  return (
    <div className="lanes">
      {LANES.map((lane) => {
        const items = tickets.filter((t) => t.status === lane.key);
        const shown = limit ? items.slice(0, limit) : items;
        return (
          <section key={lane.key} className="lane" style={{ background: lane.bg }} aria-label={TICKET_STATUS[lane.key]}>
            <div className="lane-h">
              <span>{lane.key === "resolvido" ? "Resolvido · últimos 30 dias" : TICKET_STATUS[lane.key]}</span>
              <span className="num">{items.length}</span>
            </div>
            {shown.map((t) => (
              <Link key={t.id} href={`/painel/chamados/${t.id}`} className="ticket">
                <div className="num muted" style={{ fontSize: 10.5, display: "flex", justifyContent: "space-between", gap: 6 }}>
                  <span><span style={{ color: SEVERITY[t.severity].bg === "var(--off)" ? "var(--off-ink)" : SEVERITY[t.severity].bg }}>{SEVERITY[t.severity].glyph}</span> #{t.id} · {t.assignee_name ?? "sem dono"}</span>
                  <span>{ago(t.status === "resolvido" ? t.resolved_at : t.updated_at, now)}</span>
                </div>
                <div className="t">{t.title}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {t.community}{t.house_number ? ` · Casa ${t.house_number}` : " · hub"}
                  {t.protocol_code ? ` · ${t.protocol_code}` : ""}
                  {t.status === "resolvido" && t.verified_improved !== null && (t.verified_improved ? " · dados melhoraram" : " · sem melhora")}
                </div>
              </Link>
            ))}
            {limit && items.length > limit && <div className="muted" style={{ fontSize: 12, padding: "0 4px" }}>+ {items.length - limit} chamados</div>}
            {!items.length && <div className="muted" style={{ fontSize: 12, padding: "0 4px" }}>Nenhum.</div>}
          </section>
        );
      })}
    </div>
  );
}
