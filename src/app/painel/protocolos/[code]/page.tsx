import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { getProtocol } from "@/lib/queries";

export const metadata: Metadata = { title: "Protocolo" };

export default async function ProtocolPage({ params }: { params: Promise<{ code: string }> }) {
  const p = await getProtocol((await params).code);
  if (!p) notFound();
  return (
    <>
      <nav aria-label="Caminho" className="eyebrow"><Link href="/painel/protocolos">Protocolos</Link> / {p.code}</nav>
      <div style={{ maxWidth: 760 }}>
        <h1 style={{ fontSize: 32 }}>{p.title}</h1>
        <p className="muted">{p.summary} · cerca de {p.minutes} minutos.</p>
      </div>
      <ol className="card dashed" style={{ listStyle: "none", margin: 0, padding: 0, maxWidth: 760 }}>
        {p.steps.map((s, i) => (
          <li key={i} style={{ display: "flex", gap: 16, padding: "16px 18px", alignItems: "center" }}>
            <span className="glyph" style={{ width: 56, height: 56, background: "var(--sage)", color: "var(--forest)" }}><Icon name={s.icon} size={30} /></span>
            <div>
              <div className="eyebrow">Passo {i + 1}</div>
              <div style={{ fontSize: 17 }}>{s.text}</div>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
