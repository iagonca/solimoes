"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await authClient.signIn.email({ email: email.trim().toLowerCase(), password });
      if (error) {
        setError(error.status === 401 || /invalid/i.test(error.message ?? "") ? "E-mail ou senha incorretos." : error.message ?? "Não foi possível entrar.");
        return;
      }
      router.push("/inicio");
      router.refresh();
    } catch (err) {
      // O cliente pode lançar o erro HTTP em vez de devolvê-lo em { error }.
      const e = err as { status?: number; message?: string; error?: { status?: number } };
      const status = e?.status ?? e?.error?.status;
      if (status === 401 || status === 403 || /invalid|credential/i.test(e?.message ?? "")) setError("E-mail ou senha incorretos.");
      else setError("Sem conexão com o servidor de login. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="stack" style={{ maxWidth: 380, marginTop: 20 }}>
      <label className="field">E-mail
        <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">Senha
        <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p role="alert" style={{ margin: 0, color: "var(--crit-ink)", background: "var(--crit-soft)", padding: "8px 12px", borderRadius: 6, fontSize: 14 }}>{error}</p>}
      <button className="btn primary" style={{ minHeight: 48 }} disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
