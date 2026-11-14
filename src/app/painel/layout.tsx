import Link from "next/link";
import { after } from "next/server";
import { NavLink, SignOutButton } from "@/components/client";
import { sqlOne } from "@/lib/db";
import { clock, dayLabel } from "@/lib/format";
import { getNow, refreshIndicatorsIfStale } from "@/lib/queries";
import { requireRole, TECH_ROLES } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(...TECH_ROLES);
  // Depois de responder, recalcula os indicadores guardados se estiverem velhos (sem atrasar a página).
  after(() => refreshIndicatorsIfStale().catch(() => {}));
  const [now, counts] = await Promise.all([
    getNow(),
    sqlOne<{ open: number; help: number; contacts: number; online: number; total: number }>(`select
      (select count(*) from tickets where status in ('aberto', 'em_analise'))::int as open,
      (select count(*) from contact_messages where not handled)::int as contacts,
      (select count(*) from help_requests where status = 'aberto')::int as help,
      (select count(*) from systems where last_seen >= (select app_now()) - interval '2 hours')::int as online,
      (select count(*) from systems)::int as total`),
  ]);
  const initials = profile.display_name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <Link href="/painel" className="brand">
            <svg width="28" height="28" viewBox="0 0 34 34" fill="none" stroke="#B9DD72" strokeWidth="1.6" aria-hidden="true">
              <path d="M3 22c5-3 9-3 14 0s9 3 14 0" /><path d="M3 27c5-3 9-3 14 0s9 3 14 0" />
              <path d="M17 4c-5 4-6 9-1 14 5-5 4-10 1-14z" /><path d="M17 18V9" />
            </svg>
            <b>Solimões</b><span>console técnico</span>
          </Link>
          <nav className="nav" aria-label="Principal">
            <NavLink href="/painel" exact>Visão geral</NavLink>
            <NavLink href="/painel/chamados">Chamados{counts!.open ? <span className="pill-count">{counts!.open}</span> : null}</NavLink>
            <NavLink href="/painel/pedidos">Pedidos de ajuda{counts!.help ? <span className="pill-count">{counts!.help}</span> : null}</NavLink>
            <NavLink href="/painel/protocolos">Protocolos</NavLink>
            <NavLink href="/painel/logistica">Logística</NavLink>
            <NavLink href="/painel/impacto">Impacto</NavLink>
            {profile.role === "coordenador" && <NavLink href="/painel/cadastros">Cadastros</NavLink>}
            {profile.role === "coordenador" && <NavLink href="/painel/contatos">Contatos{counts!.contacts ? <span className="pill-count">{counts!.contacts}</span> : null}</NavLink>}
          </nav>
          <div className="who">
            <span className="num" style={{ color: "var(--sage)", fontSize: 11 }}>
              {dayLabel(now)} · {clock(now)} · {counts!.online}/{counts!.total} nós
            </span>
            <span className="avatar" aria-hidden="true">{initials}</span>
            <span>{profile.display_name}<br /><span style={{ color: "var(--sage)" }}>{profile.role === "coordenador" ? "Coordenação" : "Engenharia voluntária"}</span></span>
            <SignOutButton className="btn small" label="Sair" />
          </div>
        </div>
      </header>
      <main className="wrap stack" style={{ paddingTop: 18, paddingBottom: 40 }}>{children}</main>
    </>
  );
}
