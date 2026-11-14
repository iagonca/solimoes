import type { Metadata } from "next";
import Link from "next/link";
import { agentRequestHelp } from "@/app/actions";
import { HelpRequestCard } from "@/components/HelpRequestCard";
import { Icon } from "@/components/Icon";
import { HELP_REASON } from "@/lib/format";
import { getHelpRequests, getNow, getSystems } from "@/lib/queries";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Pedir ajuda à engenharia" };

const REASONS = ["duvida_protocolo", "problema_tecnico", "outro"] as const;

export default async function AgentHelpPage() {
  const me = await requireRole("agente");
  const [houses, mine, now] = await Promise.all([
    getSystems({ communityId: me.community_id! }),
    getHelpRequests({ requesterEmail: me.email, includeResolvedDays: 7 }),
    getNow(),
  ]);
  return (
    <>
      <header className="phone-head">
        <Link href="/agente" style={{ color: "var(--sage)", fontSize: 14, textDecoration: "none" }}>← Voltar</Link>
        <h1 style={{ fontSize: 26, marginTop: 8 }}>Pedir ajuda à engenharia</h1>
        <p style={{ margin: "4px 0 0", color: "var(--sage)" }}>O pedido vai para a fila da equipe técnica.</p>
      </header>
      <div className="phone-body">
        <form action={agentRequestHelp} className="stack" style={{ gap: 12 }}>
          <label className="field" style={{ fontSize: 15 }}>Qual casa? (se for de uma casa)
            <select className="input" name="system_id" defaultValue="" style={{ fontSize: 16, minHeight: 48 }}>
              <option value="">Nenhuma em especial</option>
              {houses.sort((a, b) => a.house_number - b.house_number).map((h) => (
                <option key={h.id} value={h.id}>Casa {h.house_number} · {h.family_name}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ fontSize: 15 }}>O que está acontecendo?
            <textarea className="input" name="note" placeholder="Ex.: o terminal está quebrado, não consigo apertar" style={{ fontSize: 16 }} />
          </label>
          <div className="eyebrow">Toque no tipo de pedido para enviar</div>
          {REASONS.map((r) => (
            <button key={r} name="reason" value={r} className="btn big" style={{ justifyContent: "flex-start", paddingLeft: 18 }}>
              <Icon name={HELP_REASON[r].icon} /> {HELP_REASON[r].label}
            </button>
          ))}
        </form>

        {mine.length > 0 && (
          <section className="stack" style={{ gap: 10 }} aria-label="Meus pedidos">
            <div className="eyebrow">Seus pedidos</div>
            {mine.map((r) => <HelpRequestCard key={r.id} r={r} now={now} big canAct={false} />)}
          </section>
        )}
      </div>
    </>
  );
}
