import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Entrar" };

const DEMO = [
  ["marina@example.org", "Engenheira voluntária"],
  ["coordenacao@example.org", "Coordenação do projeto"],
  ["raimunda@example.org", "Agente local · Caiambé"],
  ["francisca@example.org", "Moradora · Caiambé, Casa 7"],
  ["lima@example.org", "Moradores · Caiambé, Casa 2"],
] as const;

export default function SignInPage() {
  return (
    <main className="wrap" style={{ maxWidth: 980, padding: "48px 24px", display: "flex", flexWrap: "wrap", gap: 32 }}>
      <div style={{ flex: "1 1 360px" }}>
        <Link href="/" className="eyebrow" style={{ textDecoration: "none" }}>← Projeto Solimões</Link>
        <h1 style={{ fontSize: 40, marginTop: 10, lineHeight: 1.1 }}>Entrar</h1>
        <p className="muted" style={{ maxWidth: 420 }}>
          Cada perfil vê uma tela: a equipe técnica acompanha todas as comunidades, o agente local recebe os protocolos e
          o morador vê a energia da própria casa.
        </p>
        <SignInForm />
      </div>
      <aside className="card" style={{ flex: "1 1 320px", alignSelf: "flex-start" }}>
        <div className="card-h"><h2>Acesso rápido</h2></div>
        <ul className="dashed" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {DEMO.map(([email, role]) => (
            <li key={email} style={{ padding: "10px 16px" }}>
              <div className="num" style={{ fontSize: 13 }}>{email}</div>
              <div className="muted" style={{ fontSize: 13 }}>{role}</div>
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}
