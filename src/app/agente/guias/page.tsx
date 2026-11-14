import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { getProtocols } from "@/lib/queries";

export const metadata: Metadata = { title: "Guias" };

export default async function GuidesPage() {
  const protocols = await getProtocols();
  return (
    <>
      <header className="phone-head"><h1>Guias</h1><p style={{ margin: "4px 0 0", color: "var(--sage)" }}>Todos os guias, para consultar quando precisar.</p></header>
      <div className="phone-body">
        {protocols.map((p) => (
          <Link key={p.code} href={`/agente/guias/${p.code}`} className="card" style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", textDecoration: "none", color: "var(--ink)", minHeight: 64 }}>
            <span className="glyph" style={{ width: 44, height: 44, background: "var(--sage)", color: "var(--forest)" }}><Icon name={p.steps[0]?.icon ?? "guia"} /></span>
            <span style={{ flex: 1 }}><b style={{ fontSize: 16 }}>{p.title}</b><br /><span className="muted" style={{ fontSize: 13 }}>{p.steps.length} passos · {p.minutes} min</span></span>
            <Icon name="seta" />
          </Link>
        ))}
      </div>
    </>
  );
}
