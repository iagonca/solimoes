import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SpeakButton } from "@/components/client";
import { Icon } from "@/components/Icon";
import { getProtocol } from "@/lib/queries";

export const metadata: Metadata = { title: "Guia" };

export default async function GuidePage({ params }: { params: Promise<{ code: string }> }) {
  const p = await getProtocol((await params).code);
  if (!p) notFound();
  const speech = `${p.title}. ${p.steps.map((s, i) => `Passo ${i + 1}. ${s.text}`).join(" ")}`;
  return (
    <>
      <header className="phone-head">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link href="/agente/guias" style={{ color: "var(--sage)", fontSize: 14, textDecoration: "none" }}>← Guias</Link>
          <SpeakButton text={speech} label="Ouvir o guia inteiro" />
        </div>
        <h1 style={{ fontSize: 26 }}>{p.title}</h1>
        <p style={{ margin: "4px 0 0", color: "var(--sage)" }}>{p.summary}</p>
      </header>
      <div className="phone-body">
        {p.steps.map((s, i) => (
          <div key={i} className="card" style={{ display: "flex", gap: 14, alignItems: "center", padding: 14 }}>
            <span className="glyph" style={{ width: 56, height: 56, background: "var(--sage)", color: "var(--forest)" }}><Icon name={s.icon} size={30} /></span>
            <div><div className="eyebrow">Passo {i + 1}</div><div style={{ fontSize: 17 }}>{s.text}</div></div>
          </div>
        ))}
      </div>
    </>
  );
}
