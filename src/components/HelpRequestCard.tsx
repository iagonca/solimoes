import { updateHelpRequest } from "@/app/actions";
import { Icon } from "@/components/Icon";
import { ago, HELP_REASON, HELP_STATUS } from "@/lib/format";
import type { HelpRequest } from "@/lib/queries";

const STATUS_BG: Record<string, string> = { aberto: "var(--ochre)", em_atendimento: "var(--sky)", resolvido: "var(--sage)" };

// Um pedido de ajuda com as ações de atender. `big` = versão de celular (agente).
export function HelpRequestCard({ r, now, big = false, canAct = true }: { r: HelpRequest; now: Date; big?: boolean; canAct?: boolean }) {
  const reason = HELP_REASON[r.reason] ?? { label: r.reason, icon: "conversa" };
  const who = r.requester_role === "morador"
    ? `${r.requester_name} · Casa ${r.house_number ?? "—"}`
    : `${r.requester_name} (agente local)${r.house_number ? ` · Casa ${r.house_number}` : ""}`;
  return (
    <div className="card" style={{ padding: big ? 14 : "10px 14px" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span className="glyph" style={{ width: big ? 44 : 34, height: big ? 44 : 34, background: STATUS_BG[r.status], color: "var(--ink)" }}>
          <Icon name={reason.icon} size={big ? 26 : 20} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <b style={{ fontSize: big ? 17 : 14.5 }}>{reason.label}</b>
            <span className="num muted" style={{ fontSize: 11.5 }}>{ago(r.created_at, now)}</span>
          </div>
          <div style={{ fontSize: big ? 15 : 13, color: "var(--ink-2)" }}>{who}{big ? "" : ` · ${r.community}`}</div>
          {r.note && <div style={{ fontSize: big ? 15 : 13.5, marginTop: 4 }}>“{r.note}”</div>}
          <div style={{ fontSize: 12.5, marginTop: 4 }} className="muted">
            {HELP_STATUS[r.status]}{r.handled_by_name ? ` · ${r.handled_by_name}` : ""}{r.response ? ` · “${r.response}”` : ""}
          </div>
        </div>
      </div>
      {canAct && r.status !== "resolvido" && (
        <form action={updateHelpRequest} style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <input type="hidden" name="id" value={r.id} />
          <input className="input" name="response" placeholder="Resposta (opcional)" aria-label="Resposta"
            style={{ flex: "1 1 200px", padding: big ? "11px 12px" : "6px 10px", fontSize: big ? 16 : 13 }} />
          {r.status === "aberto" && (
            <button className={big ? "btn primary" : "btn small primary"} name="status" value="em_atendimento" style={big ? { minHeight: 48 } : undefined}>
              {big ? "Vou passar aí" : "Assumir"}
            </button>
          )}
          <button className={big ? "btn" : "btn small"} name="status" value="resolvido" style={big ? { minHeight: 48 } : undefined}>Resolvido</button>
        </form>
      )}
    </div>
  );
}
