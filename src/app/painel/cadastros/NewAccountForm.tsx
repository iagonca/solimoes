"use client";
import { useActionState } from "react";
import { createAccount, type NewAccountResult } from "@/app/actions";

export function NewAccountForm({ communities }: { communities: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState<NewAccountResult, FormData>(createAccount, null);
  return (
    <section className="card">
      <div className="card-h"><h2>Nova conta</h2></div>
      <form action={action} className="card-b stack" style={{ gap: 10 }}>
        <label className="field">Nome<input className="input" name="name" required /></label>
        <label className="field">E-mail<input className="input" name="email" type="email" required /></label>
        <label className="field">Perfil
          <select className="input" name="role" defaultValue="engenheiro">
            <option value="engenheiro">Engenheiro voluntário</option>
            <option value="coordenador">Coordenação</option>
            <option value="agente">Agente local</option>
            <option value="morador">Morador</option>
          </select>
        </label>
        <label className="field">Comunidade (agente e morador)
          <select className="input" name="community_id" defaultValue="">
            <option value="">—</option>
            {communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <button className="btn primary" disabled={pending}>{pending ? "Criando…" : "Criar conta"}</button>
        {state?.ok === false && <p role="alert" style={{ margin: 0, color: "var(--crit-ink)" }}>{state.error}</p>}
        {state?.ok && (
          <p role="status" style={{ margin: 0, background: "var(--sage)", padding: 10, borderRadius: 6, fontSize: 13 }}>
            Conta criada para <b>{state.email}</b>. Senha provisória: <span className="num">{state.password}</span>. Ela aparece só agora; repasse por um canal seguro.
          </p>
        )}
      </form>
    </section>
  );
}
