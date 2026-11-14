import type { Metadata } from "next";
import Link from "next/link";
import { residentRequestHelp } from "@/app/actions";
import { SpeakButton } from "@/components/client";
import { Icon } from "@/components/Icon";
import { HELP_REASON } from "@/lib/format";
import { getHomeView } from "@/lib/queries";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Pedir ajuda" };
export const dynamic = "force-dynamic";

const REASONS = ["sem_luz", "bateria_apitando", "aparelho_nao_liga", "outro"] as const;

export default async function AskHelpPage() {
  const me = await requireRole("morador");
  const view = me.system_id ? await getHomeView(me.system_id) : null;
  const agent = view?.sys.agent_name?.split(" ")[0] ?? "o agente";
  return (
    <div className="phone">
      <div className="phone-body" style={{ gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link href="/casa" style={{ fontSize: 16, textDecoration: "none" }}>← Voltar</Link>
          <SpeakButton text={`O que aconteceu? Toque em um botão: ${REASONS.map((r) => HELP_REASON[r].label).join(", ")}. ${agent} e a equipe técnica vão receber.`} />
        </div>
        <h1 style={{ fontSize: 32, lineHeight: 1.1 }}>O que aconteceu?</h1>
        <p style={{ margin: 0, fontSize: 17, color: "var(--ink-2)" }}>Toque em um botão. {agent} e a equipe técnica vão receber.</p>

        <form action={residentRequestHelp} className="stack" style={{ gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            {REASONS.map((r) => (
              <button key={r} name="reason" value={r} className="card"
                style={{ minHeight: 132, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
                  background: r === "outro" ? "var(--paper-2)" : r === "sem_luz" ? "var(--rose)" : "var(--ochre)", cursor: "pointer", fontSize: 18, fontWeight: 700 }}>
                <Icon name={HELP_REASON[r].icon} size={40} />
                {HELP_REASON[r].label}
              </button>
            ))}
          </div>
          <label className="field" style={{ fontSize: 15 }}>Quer contar mais? (não precisa)
            <textarea className="input" name="note" placeholder="Ex.: começou ontem à noite" style={{ fontSize: 16 }} />
          </label>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>Depois de escrever, toque no botão do problema.</p>
        </form>
      </div>
    </div>
  );
}
