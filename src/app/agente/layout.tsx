import { TabLink } from "@/components/client";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  await requireRole("agente");
  return (
    <div className="phone">
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>{children}</div>
      <nav className="tabbar" aria-label="Navegação">
        <TabLink href="/agente" icon="casa">Hoje</TabLink>
        <TabLink href="/agente/guias" icon="guia">Guias</TabLink>
        <TabLink href="/agente/mensagens" icon="conversa">Mensagens</TabLink>
      </nav>
    </div>
  );
}
