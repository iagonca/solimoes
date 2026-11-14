import type { Metadata } from "next";
import { TicketLanes } from "@/components/TicketLanes";
import { getNow, getTickets } from "@/lib/queries";

export const metadata: Metadata = { title: "Chamados" };

export default async function TicketsPage() {
  const [now, tickets] = await Promise.all([getNow(), getTickets()]);
  const resolved = tickets.filter((t) => t.status === "resolvido");
  const verified = resolved.filter((t) => t.verified_improved).length;
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: 30 }}>Fila de chamados</h1>
          <p className="muted" style={{ margin: "4px 0 0", maxWidth: 720 }}>
            Cada alerta vira um chamado. O engenheiro assume, olha os gráficos, escreve o diagnóstico e manda um protocolo ao
            agente local. Quando o agente confirma, o sistema confere sozinho se os dados melhoraram.
          </p>
        </div>
        <div className="num muted" style={{ fontSize: 13 }}>{verified} de {resolved.length} resolvidos com melhora confirmada</div>
      </div>
      <TicketLanes tickets={tickets} now={now} />
    </>
  );
}
