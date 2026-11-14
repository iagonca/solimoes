import type { Metadata } from "next";
import Link from "next/link";
import { updateProfile } from "@/app/actions";
import { sql } from "@/lib/db";
import { getCommunities, getProfiles } from "@/lib/queries";
import { requireRole } from "@/lib/session";
import { NewAccountForm } from "./NewAccountForm";

export const metadata: Metadata = { title: "Cadastros" };

const ROLES = [["engenheiro", "Engenheiro voluntário"], ["coordenador", "Coordenação"], ["agente", "Agente local"], ["morador", "Morador"]] as const;

export default async function CadastrosPage() {
  await requireRole("coordenador");
  const [profiles, communities, systems] = await Promise.all([
    getProfiles(), getCommunities(),
    sql<{ id: number; label: string; community_id: number }>(`select s.id, c.name || ' · Casa ' || s.house_number || ' · ' || s.family_name as label, s.community_id
      from systems s join communities c on c.id = s.community_id order by c.name, s.house_number`),
  ]);
  return (
    <>
      <div>
        <h1 style={{ fontSize: 30 }}>Cadastros</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>Quem tem acesso à plataforma e as comunidades atendidas.</p>
      </div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <section className="card grow">
          <div className="card-h"><h2>Pessoas com acesso</h2><span className="eyebrow">{profiles.length}</span></div>
          <div className="table-box">
            <table className="dense">
              <thead><tr><th>Nome</th><th>Perfil</th><th>Comunidade</th><th>Casa (morador)</th><th>Ativo</th><th /></tr></thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.email}>
                    <td><b>{p.display_name}</b><div className="muted num" style={{ fontSize: 11 }}>{p.email}</div></td>
                    <td colSpan={5} style={{ padding: 4 }}>
                      <form action={updateProfile} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <input type="hidden" name="email" value={p.email} />
                        <select className="input" name="role" defaultValue={p.role} aria-label="Perfil" style={{ padding: "5px 8px", fontSize: 13 }}>
                          {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <select className="input" name="community_id" defaultValue={p.community_id ?? ""} aria-label="Comunidade" style={{ padding: "5px 8px", fontSize: 13 }}>
                          <option value="">—</option>
                          {communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <select className="input" name="system_id" defaultValue={p.system_id ?? ""} aria-label="Casa" style={{ padding: "5px 8px", fontSize: 13, maxWidth: 220 }}>
                          <option value="">—</option>
                          {systems.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                        <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 13 }}>
                          <input type="checkbox" name="active" defaultChecked={p.active} /> ativo
                        </label>
                        <button className="btn small">Salvar</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <div className="side stack">
          <NewAccountForm communities={communities.map((c) => ({ id: c.id, name: c.name }))} />
          <section className="card">
            <div className="card-h"><h2>Comunidades</h2><Link href="/painel/cadastros/comunidades/nova" className="btn small primary">Nova comunidade</Link></div>
            <ul className="dashed" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {communities.map((c) => (
                <li key={c.id} style={{ padding: "8px 14px", fontSize: 13.5, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <span><b>{c.name}</b> · {c.houses} casas<div className="muted" style={{ fontSize: 12 }}>{c.municipality} · agente {c.agent_name ?? "—"}</div></span>
                  <Link href={`/painel/cadastros/comunidades/${c.slug}`} className="btn small">Editar</Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
