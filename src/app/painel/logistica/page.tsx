import type { Metadata } from "next";
import { addLogisticsItem, setLogisticsStatus } from "@/app/actions";
import { dateShort } from "@/lib/format";
import { getCommunities, getLogistics } from "@/lib/queries";

export const metadata: Metadata = { title: "Logística" };

const NEXT: Record<string, "embarcado" | "entregue" | null> = { pendente: "embarcado", embarcado: "entregue", entregue: null };
const STATUS_BG: Record<string, string> = { pendente: "var(--rose)", embarcado: "var(--ochre)", entregue: "var(--sage)" };

export default async function LogisticsPage() {
  const [items, communities] = await Promise.all([getLogistics(), getCommunities()]);
  const groups = new Map<string, typeof items>();
  for (const it of items) groups.set(it.community_slug, [...(groups.get(it.community_slug) ?? []), it]);

  return (
    <>
      <div>
        <h1 style={{ fontSize: 30 }}>Próximas viagens de barco</h1>
        <p className="muted" style={{ margin: "4px 0 0", maxWidth: 720 }}>
          Peças e intervenções pendentes por comunidade, para o barco levar tudo de uma vez.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
        {[...groups.values()].map((list) => (
          <section key={list[0].community_slug} className="card">
            <div className="card-h">
              <h2>{list[0].community}</h2>
              <span className="eyebrow">barco {list[0].boat_next_trip ? dateShort(list[0].boat_next_trip) : "sem data"}</span>
            </div>
            <ul className="dashed" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {list.map((it) => (
                <li key={it.id} style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
                  <span style={{ flex: 1 }}><span className="num">{it.qty}×</span> {it.item}</span>
                  <span className="chip" style={{ background: STATUS_BG[it.status] }}>{it.status}</span>
                  {NEXT[it.status] && (
                    <form action={setLogisticsStatus.bind(null, it.id, NEXT[it.status]!)}>
                      <button className="btn small">{NEXT[it.status] === "embarcado" ? "Embarcar" : "Entregue"}</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <section className="card" style={{ maxWidth: 760 }}>
        <div className="card-h"><h2>Adicionar item</h2></div>
        <form action={addLogisticsItem} className="card-b row" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 200px" }}>Comunidade
            <select className="input" name="community_id" required>
              {communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field" style={{ flex: "2 1 240px" }}>Item
            <input className="input" name="item" required placeholder="Ex.: Fusível 20 A" />
          </label>
          <label className="field" style={{ flex: "0 1 90px" }}>Qtd.
            <input className="input" name="qty" type="number" min={1} defaultValue={1} />
          </label>
          <button className="btn primary">Adicionar</button>
        </form>
      </section>
    </>
  );
}
