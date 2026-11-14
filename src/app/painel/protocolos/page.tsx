import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { getProtocols } from "@/lib/queries";

export const metadata: Metadata = { title: "Protocolos" };

export default async function ProtocolsPage() {
  const protocols = await getProtocols();
  return (
    <>
      <div>
        <h1 style={{ fontSize: 30 }}>Biblioteca de protocolos</h1>
        <p className="muted" style={{ margin: "4px 0 0", maxWidth: 720 }}>
          Guias em linguagem simples para o agente local. O engenheiro escolhe um deles no chamado, e o guia chega ao
          celular do agente.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {protocols.map((p) => (
          <Link key={p.code} href={`/painel/protocolos/${p.code}`} className="card" style={{ textDecoration: "none", color: "var(--ink)", display: "flex", flexDirection: "column" }}>
            <div className="card-b stack" style={{ gap: 8, flex: 1 }}>
              <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                <span className="eyebrow">{p.code} · {p.minutes} min · {p.steps.length} passos</span>
                <span className="eyebrow">{p.uses_30d} usos em 30 d</span>
              </div>
              <h2 style={{ fontSize: 20 }}>{p.title}</h2>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>{p.summary}</p>
              <div style={{ display: "flex", gap: 6, marginTop: "auto", color: "var(--forest)" }}>
                {p.steps.map((s, i) => <span key={i} className="glyph" style={{ background: "var(--sage)", width: 30, height: 30 }}><Icon name={s.icon} size={18} /></span>)}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
