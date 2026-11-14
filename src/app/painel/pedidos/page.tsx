import type { Metadata } from "next";
import { HelpRequestCard } from "@/components/HelpRequestCard";
import { getHelpRequests, getNow } from "@/lib/queries";

export const metadata: Metadata = { title: "Pedidos de ajuda" };

export default async function HelpRequestsPage() {
  const [requests, now] = await Promise.all([getHelpRequests({ includeResolvedDays: 7 }), getNow()]);
  const fromAgents = requests.filter((r) => r.requester_role === "agente");
  const fromResidents = requests.filter((r) => r.requester_role === "morador");
  return (
    <>
      <div>
        <h1 style={{ fontSize: 30 }}>Pedidos de ajuda</h1>
        <p className="muted" style={{ margin: "4px 0 0", maxWidth: 760 }}>
          Pedidos feitos por pessoas, separados dos chamados que vêm dos sensores. O pedido de um morador chega aqui e ao
          agente local ao mesmo tempo.
        </p>
      </div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <section className="stack" style={{ flex: "1 1 420px", minWidth: 0, gap: 10 }} aria-label="Dos agentes locais">
          <h2 style={{ fontSize: 20 }}>Dos agentes locais <span className="num muted" style={{ fontSize: 14 }}>{fromAgents.filter((r) => r.status !== "resolvido").length} abertos</span></h2>
          {fromAgents.map((r) => <HelpRequestCard key={r.id} r={r} now={now} />)}
          {!fromAgents.length && <p className="muted">Nenhum pedido.</p>}
        </section>
        <section className="stack" style={{ flex: "1 1 420px", minWidth: 0, gap: 10 }} aria-label="Dos moradores">
          <h2 style={{ fontSize: 20 }}>Dos moradores <span className="num muted" style={{ fontSize: 14 }}>{fromResidents.filter((r) => r.status !== "resolvido").length} abertos</span></h2>
          {fromResidents.map((r) => <HelpRequestCard key={r.id} r={r} now={now} />)}
          {!fromResidents.length && <p className="muted">Nenhum pedido.</p>}
        </section>
      </div>
    </>
  );
}
