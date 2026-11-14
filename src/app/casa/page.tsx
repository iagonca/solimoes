import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton, SpeakButton } from "@/components/client";
import { Icon } from "@/components/Icon";
import { HELP_REASON, HELP_STATUS, weekdayShort } from "@/lib/format";
import { getHelpRequests, getHomeView } from "@/lib/queries";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Minha energia" };
export const dynamic = "force-dynamic";

// Horas de uso típicas de cada aparelho até o sol voltar (noite + madrugada).
const NIGHT_HOURS: Record<string, number> = { luz: 5, celular: 2, radio: 2, tv: 3, freezer: 14, ventilador: 6 };

type Use = { kind: string; label: string; verdict: "ok" | "pouco" | "nao"; note: string };

// Distribui a energia que dá para tirar da bateria sem descer de 50% entre os aparelhos,
// primeiro os essenciais (luz), depois do menor para o maior consumo.
function planNight(socPct: number, bankWh: number, appliances: { kind: string; label: string; watts: number; essential: boolean }[]): Use[] {
  let left = Math.max(0, (socPct - 50) / 100) * bankWh;
  return appliances.map((a) => {
    const hours = NIGHT_HOURS[a.kind] ?? 3;
    const need = a.watts * hours;
    if (a.essential || left >= need) {
      left = Math.max(0, left - need);
      return { kind: a.kind, label: a.label, verdict: "ok", note: a.kind === "freezer" ? "Ligado" : a.kind === "luz" ? "A noite toda" : "Pode usar" };
    }
    if (left > need * 0.25) {
      const h = Math.max(1, Math.floor(left / a.watts));
      left = 0;
      return { kind: a.kind, label: a.label, verdict: "pouco", note: `Só ${h} h` };
    }
    return { kind: a.kind, label: a.label, verdict: "nao", note: a.kind === "freezer" ? "Desligue à noite" : "Deixe para o dia" };
  });
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const me = await requireRole("morador");
  const { pedido } = await searchParams;
  const view = me.system_id ? await getHomeView(me.system_id) : null;
  if (!view) return <p style={{ padding: 20 }}>Sua casa ainda não está ligada ao seu perfil. Fale com o agente local.</p>;
  const requests = await getHelpRequests({ requesterEmail: me.email, includeResolvedDays: 3 });
  const { sys, appliances, forecast } = view;
  const soc = sys.soc ?? 0;
  const parts = soc >= 87.5 ? 4 : soc >= 62.5 ? 3 : soc >= 37.5 ? 2 : soc >= 12.5 ? 1 : 0;
  const level = soc >= 75 ? "cheia" : soc >= 50 ? "media" : "baixa";
  const headline = { cheia: "Tem energia para a noite", media: "Dá para a noite, sem exagero", baixa: "Pouca energia" }[level];
  const sub = sys.cut
    ? "O sistema desligou o freezer e a TV para proteger a bateria."
    : { cheia: "Pode usar normalmente.", media: "Evite deixar a TV ligada até tarde.", baixa: "Economize até o sol voltar." }[level];
  const uses = planNight(soc, sys.bank_nominal_v * sys.bank_nominal_ah, appliances);
  const days = forecast.map((d) => ({
    name: weekdayShort(d.day).replace("-feira", ""),
    sun: d.kwh_m2 >= 4,
    note: d.kwh_m2 >= 4 ? "enche tudo" : d.kwh_m2 >= 2.5 ? "enche metade" : "enche pouco",
  }));
  const speech = `${headline}. A bateria está com ${parts} de 4 partes. ${sub} ${uses.map((u) => `${u.label}: ${u.verdict === "ok" ? "pode usar" : u.verdict === "pouco" ? u.note.toLowerCase() : u.note.toLowerCase()}.`).join(" ")}`;
  const tone = { cheia: "var(--sage)", media: "var(--ochre)", baixa: "var(--rose)" }[level];
  const phone = sys.agent_phone?.replace(/\D/g, "");

  return (
    <div className="phone">
      <div className="phone-body" style={{ gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 17 }}><b>Casa {sys.house_number}</b> · {me.display_name}</div>
          <SpeakButton text={speech} />
        </div>

        {pedido && (
          <p role="status" style={{ margin: 0, background: "var(--sage)", padding: "12px 14px", borderRadius: 6, fontSize: 17 }}>
            Pedido enviado. {sys.agent_name?.split(" ")[0]} e a equipe técnica vão ver.
          </p>
        )}

        <section className="card" style={{ padding: "20px 18px", textAlign: "center", background: "var(--paper-2)" }} aria-label="Bateria">
          <svg viewBox="0 0 220 110" style={{ width: 220, maxWidth: "100%" }} role="img" aria-label={`Bateria com ${parts} de 4 partes`}>
            <rect x="4" y="14" width="196" height="88" rx="10" fill="none" stroke="#1E2A22" strokeWidth="3" />
            <rect x="200" y="40" width="14" height="36" rx="4" fill="#1E2A22" />
            {[0, 1, 2, 3].map((i) => (
              <rect key={i} x={16 + i * 46} y={26} width={i === 3 ? 34 : 40} height={64} rx={4}
                fill={i < parts ? (level === "baixa" ? "#B5482F" : "#0B4D3B") : "none"}
                stroke={i < parts ? "none" : "#B9B39F"} strokeWidth={2} strokeDasharray={i < parts ? undefined : "5 4"} />
            ))}
          </svg>
          <h1 style={{ fontSize: 32, lineHeight: 1.1, marginTop: 8 }}>{headline}</h1>
          <p style={{ margin: "8px 0 0", fontSize: 17, background: tone, borderRadius: 6, padding: "8px 10px" }}>{sub}</p>
        </section>

        <section aria-label="Hoje à noite">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Hoje à noite</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 8 }}>
            {uses.map((u) => (
              <div key={u.kind} style={{ background: u.verdict === "ok" ? "var(--sage)" : u.verdict === "pouco" ? "var(--ochre)" : "var(--rose)", borderRadius: 6, padding: "12px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
                <Icon name={u.kind} size={30} />
                <div style={{ fontSize: 15, fontWeight: 600 }}>{u.label.replace(" (3)", "")}</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{u.verdict === "ok" ? "✓ " : u.verdict === "nao" ? "✕ " : ""}{u.note}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ borderTop: "1.5px solid var(--ink)", borderBottom: "1.5px solid var(--ink)", padding: "12px 0" }} aria-label="Próximos dias">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Os próximos dias</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, textAlign: "center" }}>
            {days.map((d, i) => (
              <div key={i}>
                <span style={{ color: d.sun ? "#B08A2E" : "#8A8571" }}><Icon name={d.sun ? "sol" : "nuvem"} size={38} /></span>
                <div style={{ fontSize: 15, fontWeight: 600, textTransform: "capitalize" }}>{i === 0 ? "Amanhã" : d.name}</div>
                <div className="muted" style={{ fontSize: 14 }}>{d.note}</div>
              </div>
            ))}
          </div>
        </section>

        {requests.length > 0 && (
          <section className="card" aria-label="Meus pedidos de ajuda">
            <div className="card-h"><h2 style={{ fontSize: 18 }}>Seus pedidos</h2></div>
            <ul className="dashed" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {requests.map((r) => (
                <li key={r.id} style={{ padding: "10px 14px", display: "flex", gap: 12, alignItems: "center" }}>
                  <Icon name={HELP_REASON[r.reason]?.icon ?? "conversa"} size={26} />
                  <div style={{ flex: 1 }}>
                    <b style={{ fontSize: 16 }}>{HELP_REASON[r.reason]?.label}</b>
                    <div style={{ fontSize: 14, color: "var(--ink-2)" }}>
                      {r.status === "aberto" ? "Enviado. Esperando resposta." : r.status === "em_atendimento" ? `${r.handled_by_name?.split(" ")[0]} está vendo isso.` : "Resolvido."}
                      {r.response ? ` “${r.response}”` : ""}
                    </div>
                  </div>
                  <span className="chip" style={{ background: r.status === "resolvido" ? "var(--sage)" : r.status === "em_atendimento" ? "var(--sky)" : "var(--ochre)" }}>{HELP_STATUS[r.status]}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="stack" style={{ marginTop: "auto", gap: 10 }}>
          <Link href="/casa/ajuda" className="btn primary big"><Icon name="chamado" /> Pedir ajuda</Link>
          <a href={phone ? `https://wa.me/${phone}` : "#"} className="btn big">
            <Icon name="conversa" /> Chamar {sys.agent_name?.split(" ")[0]} no WhatsApp
          </a>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}><SignOutButton /></div>
      </div>
    </div>
  );
}
