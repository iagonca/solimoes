import type { Metadata } from "next";
import Link from "next/link";
import { getNow } from "@/lib/queries";
import { requireRole } from "@/lib/session";
import { NewCommunityForm } from "../forms";

export const metadata: Metadata = { title: "Nova comunidade" };

export default async function NewCommunityPage() {
  await requireRole("coordenador");
  const now = await getNow();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Manaus" }).format(now);
  return (
    <>
      <nav aria-label="Caminho" className="eyebrow"><Link href="/painel/cadastros">Cadastros</Link> / Nova comunidade</nav>
      <div>
        <h1 style={{ fontSize: 30 }}>Nova comunidade</h1>
        <p className="muted" style={{ margin: "4px 0 0", maxWidth: 720 }}>
          Cria a comunidade e as casas com um kit padrão, numa grade em volta da coordenada. Depois você ajusta família,
          posição e equipamento de cada casa. As casas aparecem sem dados até o primeiro pacote do nó chegar.
        </p>
      </div>
      <NewCommunityForm today={today} />
    </>
  );
}
