"use client";
import { useActionState } from "react";
import { sendContact, type FormResult } from "@/app/actions";

const AUDIENCES = [
  ["comunidade", "Uma comunidade"],
  ["concessionaria", "Uma concessionária de energia"],
  ["governo", "Governo ou programa público"],
  ["outro", "Outro"],
] as const;

export function ContactForm() {
  const [state, action, pending] = useActionState<FormResult, FormData>(sendContact, null);
  const v = state && !state.ok ? state.values ?? {} : {};
  if (state?.ok) {
    return (
      <div className="card" style={{ padding: 28 }} role="status">
        <h2 style={{ fontSize: 26, color: "var(--forest-2)" }}>Recebemos sua mensagem</h2>
        <p style={{ fontSize: 17, color: "var(--ink-2)", marginBottom: 0 }}>{state.message}</p>
      </div>
    );
  }
  return (
    <form action={action} key={JSON.stringify(v)} className="card stack" style={{ padding: 24, gap: 14 }}>
      <label className="field">Seu nome<input className="input" name="name" required maxLength={120} defaultValue={v.name} autoComplete="name" /></label>
      <label className="field">E-mail<input className="input" name="email" type="email" required defaultValue={v.email} autoComplete="email" placeholder="voce@organizacao.org" /></label>
      <label className="field">Organização (se houver)<input className="input" name="organization" maxLength={160} defaultValue={v.organization} autoComplete="organization" /></label>
      <label className="field">Você fala em nome de
        <select className="input" name="audience" required defaultValue={v.audience ?? ""}>
          <option value="" disabled>Escolha uma opção</option>
          {AUDIENCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="field">Mensagem
        <textarea className="input" name="message" required maxLength={4000} defaultValue={v.message} style={{ minHeight: 140 }}
          placeholder="Quantas casas, onde ficam e o que vocês precisam acompanhar" />
      </label>
      {/* Armadilha para robôs: pessoas não veem este campo. */}
      <div aria-hidden="true" style={{ position: "absolute", left: -10000, width: 1, height: 1, overflow: "hidden" }}>
        <label>Site<input name="site" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {state && !state.ok && <p role="alert" style={{ margin: 0, background: "var(--crit-soft)", color: "var(--crit-ink)", padding: "8px 12px", borderRadius: 8 }}>{state.error}</p>}
      <button className="btn primary" style={{ minHeight: 48 }} disabled={pending}>{pending ? "Enviando…" : "Enviar mensagem"}</button>
    </form>
  );
}
