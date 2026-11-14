import type { Metadata } from "next";
import Link from "next/link";
import { BarChart } from "@/components/Chart";
import { dateShort, num } from "@/lib/format";
import { getDailyGeneration, getImpact } from "@/lib/queries";

export const metadata: Metadata = { title: "Impacto" };

export default async function PainelImpact() {
  const [impact, daily] = await Promise.all([getImpact(), getDailyGeneration()]);
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <h1 style={{ fontSize: 30 }}>Indicadores de impacto</h1>
        <Link href="/impacto">Ver a página pública →</Link>
      </div>
      <section className="kpis">
        {[
          { l: "Energia gerada (30 d)", v: num(impact.kwh_30d, 0), u: "kWh" },
          { l: "Diesel evitado", v: num(impact.diesel_l_30d, 0), u: "L" },
          { l: "CO₂ evitado", v: num(impact.co2_kg_30d / 1000, 2), u: "t" },
          { l: "Idade média das baterias", v: num(impact.battery_age_years, 1), u: "anos" },
          { l: "Vida média projetada", v: num(impact.battery_life_years, 1), u: "anos" },
          { l: "Chamados resolvidos (30 d)", v: String(impact.tickets_resolved_30d), u: "" },
          { l: "Com melhora confirmada", v: String(impact.tickets_verified_30d), u: "" },
        ].map((k) => <div className="kpi" key={k.l}><div className="l">{k.l}</div><div className="v">{k.v}<small>{k.u}</small></div></div>)}
      </section>
      <section className="card">
        <div className="card-h"><h2>Geração diária de todas as casas</h2><span className="eyebrow">fatores: {num(impact.l_per_kwh, 1)} L/kWh · {num(impact.kg_per_l, 1)} kg CO₂/L</span></div>
        <div className="card-b">
          <BarChart labels={daily.map((d) => dateShort(d.day))} values={daily.map((d) => +d.kwh.toFixed(1))} color="#7FA889" unit="kWh"
            line={daily.map((d) => +(d.irr ?? 0).toFixed(2))} lineLabel="irradiação média (kWh/m²)" lineUnit="kWh/m²" />
        </div>
      </section>
    </>
  );
}
