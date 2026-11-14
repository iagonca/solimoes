import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sql, sqlOne } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { EditCommunityForm, HouseRow, type HouseValues } from "../forms";

export const metadata: Metadata = { title: "Editar comunidade" };

export default async function EditCommunityPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ criada?: string }>;
}) {
  await requireRole("coordenador");
  const { slug } = await params;
  const { criada } = await searchParams;
  const c = await sqlOne<{ id: number; slug: string; name: string; municipality: string; lat: number; lon: number;
    agent_name: string | null; agent_phone: string | null; boat_next_trip: string | null }>(
    "select id, slug, name, municipality, lat, lon, agent_name, agent_phone, boat_next_trip from communities where slug = $1", [slug]);
  if (!c) notFound();
  const houses = await sql<HouseValues>(
    `select id, house_number, family_name, lat, lon, battery_model, panel_wp::float as panel_wp, installed_on,
       last_seen is not null as has_data, node_id
     from systems where community_id = $1 order by house_number`, [c.id]);

  return (
    <>
      <nav aria-label="Caminho" className="eyebrow"><Link href="/painel/cadastros">Cadastros</Link> / {c.name}</nav>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <h1 style={{ fontSize: 30 }}>{c.name}</h1>
        <Link href={`/painel/comunidade/${c.slug}`}>Ver no painel →</Link>
      </div>
      {criada && <p role="status" style={{ margin: 0, background: "var(--sage)", padding: "10px 14px", borderRadius: 6 }}>
        Comunidade criada com {houses.length} casas. Ajuste abaixo a família e a posição de cada uma.</p>}
      <EditCommunityForm v={{
        id: c.id, slug: c.slug, name: c.name, municipality: c.municipality, lat: c.lat, lon: c.lon,
        agent_name: c.agent_name ?? "", agent_phone: c.agent_phone ?? "", boat_next_trip: c.boat_next_trip ?? "",
      }} />
      <section className="card">
        <div className="card-h"><h2>Casas</h2><span className="eyebrow">família · latitude · longitude · bateria · Wp · instalação · nó do ESP32</span></div>
        <div className="dashed">{houses.map((h) => <HouseRow key={h.id} h={h} />)}</div>
      </section>
    </>
  );
}
