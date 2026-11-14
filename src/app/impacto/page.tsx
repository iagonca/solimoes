import type { Metadata } from "next";
import { BarChart } from "@/components/Chart";
import { Icon } from "@/components/Icon";
import { PublicFooter, PublicHeader } from "@/components/PublicShell";
import { dateShort, num } from "@/lib/format";
import { getDailyGeneration, getImpact } from "@/lib/queries";

export const metadata: Metadata = { title: "Impacto" };
export const dynamic = "force-dynamic";

export default async function ImpactPage() {
  const [impact, daily] = await Promise.all([getImpact(), getDailyGeneration()]);
  const big = [
    { v: num(impact.kwh_30d, 0), u: "kWh", l: "gerados pelo sol nos últimos 30 dias" },
    { v: num(impact.diesel_l_30d, 0), u: "L", l: "de diesel que deixaram de ser queimados" },
    { v: num(impact.co2_kg_30d / 1000, 2), u: "t CO₂", l: "que não foram para o ar" },
    { v: num(impact.battery_life_years, 1), u: "anos", l: "de vida média projetada das baterias" },
    { v: String(impact.tickets_resolved_30d), u: "chamados", l: `resolvidos em 30 dias, ${impact.tickets_verified_30d} deles com melhora confirmada nos dados` },
  ];
  return (
    <>
      <PublicHeader />
      <main className="wrap stack" style={{ paddingTop: 36, paddingBottom: 56, gap: 28 }}>
        <section style={{ maxWidth: 820 }}>
          <div className="eyebrow">Médio Solimões, Amazonas</div>
          <h1 style={{ fontSize: "clamp(34px, 5vw, 56px)", lineHeight: 1.05, marginTop: 10 }}>
            O que a energia solar já fez nas comunidades
          </h1>
          <p style={{ fontSize: 18, color: "var(--ink-2)", maxWidth: 680 }}>
            Hoje são {impact.systems} casas em {impact.communities} comunidades ribeirinhas com um sensor ao lado da bateria.
            Estes números saem dos dados que elas enviam e são atualizados sozinhos.
          </p>
        </section>

        <section aria-label="Números de impacto" className="kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
          {big.map((b) => (
            <div className="kpi" key={b.l} style={{ padding: "18px 18px" }}>
              <div className="v" style={{ fontSize: 40 }}>{b.v}<small>{b.u}</small></div>
              <div className="l" style={{ fontSize: 14, color: "var(--ink-2)" }}>{b.l}</div>
            </div>
          ))}
        </section>

        <div className="row">
          <section className="card grow">
            <div className="card-h"><h2>Geração diária e sol medido nos hubs</h2><span className="eyebrow">30 dias</span></div>
            <div className="card-b">
              <BarChart labels={daily.map((d) => dateShort(d.day))} values={daily.map((d) => +d.kwh.toFixed(1))} color="#7FA889"
                unit="kWh" line={daily.map((d) => +(d.irr ?? 0).toFixed(2))} lineLabel="irradiação (kWh/m²)" lineUnit="kWh/m²" />
            </div>
          </section>
          <section className="card side">
            <div className="card-h"><h2>Como a conta é feita</h2></div>
            <div className="card-b stack" style={{ gap: 10, fontSize: 14 }}>
              <p style={{ margin: 0 }}>Para o diesel evitado, multiplicamos a energia gerada pelo que um gerador pequeno
                gastaria para produzi-la, estimado em <b className="num">{num(impact.l_per_kwh, 1)} L/kWh</b>.</p>
              <p style={{ margin: 0 }}>Cada litro de diesel queimado emite cerca de <b className="num">{num(impact.kg_per_l, 1)} kg</b> de CO₂.</p>
              <p style={{ margin: 0 }}>Para a vida projetada das baterias, dividimos a idade de cada banco pela parte da vida
                nominal (500 ciclos a 50% de profundidade) que ele já gastou.</p>
            </div>
          </section>
        </div>

        <section className="card">
          <div className="card-h"><h2>O caminho de um alerta</h2></div>
          <ol className="lanes" style={{ listStyle: "none", margin: 0, padding: 16 }}>
            {[
              ["bateria", "Nó na casa", "Um ESP32 mede bateria, painel e temperatura e protege a bateria sozinho."],
              ["antena", "Hub da comunidade", "Recebe por LoRa e envia por satélite; guarda os dados se a conexão cair."],
              ["chamado", "Equipe técnica", "Recebe o alerta, analisa os gráficos e escolhe um protocolo."],
              ["pessoas", "Agente local", "Recebe o passo a passo no celular, executa e confirma."],
            ].map(([icon, t, d], i) => (
              <li key={t} style={{ display: "flex", gap: 12 }}>
                <span className="glyph" style={{ width: 40, height: 40, background: "var(--sage)", color: "var(--forest)" }}><Icon name={icon} /></span>
                <div><div className="eyebrow">{i + 1}</div><b>{t}</b><div className="muted" style={{ fontSize: 14 }}>{d}</div></div>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
