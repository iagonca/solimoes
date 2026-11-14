"use client";
import { useActionState, useState } from "react";
import { createCommunity, updateCommunity, updateHouse, type FormResult } from "@/app/actions";

export type CommunityValues = {
  id?: number; slug: string; name: string; municipality: string; lat: number | ""; lon: number | "";
  agent_name: string; agent_phone: string; boat_next_trip: string;
};

// "Vila Nova do Juruá" → "vila-nova-do-jurua"
function slugify(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function Feedback({ state }: { state: FormResult }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} style={{ margin: 0, padding: "8px 12px", borderRadius: 6, fontSize: 14,
      background: state.ok ? "var(--sage)" : "var(--crit-soft)", color: state.ok ? "var(--ink)" : "var(--crit-ink)" }}>
      {state.ok ? state.message : state.error}
    </p>
  );
}

// Valores reenviados pelo servidor quando a action falha (o React limpa o formulário).
function sent(state: FormResult): Record<string, string> {
  return state && !state.ok ? state.values ?? {} : {};
}
function merge<T extends Record<string, unknown>>(base: T, vals: Record<string, string>): T {
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(base)) if (k in vals) out[k] = vals[k];
  return out as T;
}

const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 } as const;

function CommunityFields({ v, onName }: { v: CommunityValues; onName?: (name: string) => void }) {
  const [slug, setSlug] = useState(v.slug);
  const [touched, setTouched] = useState(!!v.slug);
  return (
    <div style={grid}>
      <label className="field">Nome
        <input className="input" name="name" required defaultValue={v.name}
          onChange={(e) => { onName?.(e.target.value); if (!touched) setSlug(slugify(e.target.value)); }} />
      </label>
      <label className="field">Identificador na URL
        <input className="input num" name="slug" required value={slug} pattern="[a-z0-9]+(-[a-z0-9]+)*"
          onChange={(e) => { setTouched(true); setSlug(e.target.value); }} />
      </label>
      <label className="field">Município<input className="input" name="municipality" required defaultValue={v.municipality} /></label>
      <label className="field">Latitude (graus decimais)<input className="input num" name="lat" required inputMode="decimal" defaultValue={v.lat} placeholder="-3.53" /></label>
      <label className="field">Longitude (graus decimais)<input className="input num" name="lon" required inputMode="decimal" defaultValue={v.lon} placeholder="-64.39" /></label>
      <label className="field">Agente local<input className="input" name="agent_name" defaultValue={v.agent_name} /></label>
      <label className="field">Telefone do agente<input className="input num" name="agent_phone" defaultValue={v.agent_phone} placeholder="+55 97 9 0000-0000" /></label>
      <label className="field">Próxima viagem de barco<input className="input" type="date" name="boat_next_trip" defaultValue={v.boat_next_trip} /></label>
    </div>
  );
}

export function NewCommunityForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState<FormResult, FormData>(createCommunity, null);
  const vals = sent(state);
  const empty = merge<CommunityValues>({ slug: "", name: "", municipality: "", lat: "", lon: "", agent_name: "", agent_phone: "", boat_next_trip: "" }, vals);
  const d = (k: string, fallback: string | number) => vals[k] ?? fallback;
  return (
    <form action={action} className="stack" style={{ gap: 16 }} key={JSON.stringify(vals)}>
      <section className="card">
        <div className="card-h"><h2>Comunidade</h2></div>
        <div className="card-b"><CommunityFields v={empty} /></div>
      </section>
      <section className="card">
        <div className="card-h"><h2>Casas e kit padrão</h2><span className="eyebrow">dá para ajustar cada casa depois</span></div>
        <div className="card-b" style={grid}>
          <label className="field">Número de casas<input className="input num" name="houses" type="number" min={1} max={50} required defaultValue={d("houses", 6)} /></label>
          <label className="field">Modelo da bateria<input className="input" name="battery_model" required defaultValue={d("battery_model", "Moura 12MF105")} /></label>
          <label className="field">Baterias por casa<input className="input num" name="battery_count" type="number" min={1} required defaultValue={d("battery_count", 2)} /></label>
          <label className="field">Tensão do banco (V)<input className="input num" name="bank_v" inputMode="decimal" required defaultValue={d("bank_v", 24)} /></label>
          <label className="field">Capacidade do banco (Ah)<input className="input num" name="bank_ah" inputMode="decimal" required defaultValue={d("bank_ah", 105)} /></label>
          <label className="field">Painéis por casa<input className="input num" name="panel_count" type="number" min={1} required defaultValue={d("panel_count", 2)} /></label>
          <label className="field">Potência de cada painel (Wp)<input className="input num" name="panel_wp" inputMode="decimal" required defaultValue={d("panel_wp", 160)} /></label>
          <label className="field">Data de instalação<input className="input" type="date" name="installed_on" required defaultValue={d("installed_on", today)} /></label>
          <label className="field">R<sub>int</sub> inicial do banco (mΩ)<input className="input num" name="rint" inputMode="decimal" required defaultValue={d("rint", 30)} /></label>
        </div>
      </section>
      <Feedback state={state} />
      <div><button className="btn primary" disabled={pending}>{pending ? "Criando…" : "Criar comunidade e casas"}</button></div>
    </form>
  );
}

export function EditCommunityForm({ v }: { v: CommunityValues }) {
  const [state, action, pending] = useActionState<FormResult, FormData>(updateCommunity, null);
  const vals = sent(state);
  const cur = merge(v, vals);
  return (
    <form action={action} className="card" key={JSON.stringify(vals)}>
      <div className="card-h"><h2>Comunidade</h2></div>
      <div className="card-b stack" style={{ gap: 12 }}>
        <input type="hidden" name="id" value={v.id} />
        <input type="hidden" name="old_slug" value={v.slug} />
        <CommunityFields v={cur} />
        <Feedback state={state} />
        <div><button className="btn primary" disabled={pending}>{pending ? "Salvando…" : "Salvar comunidade"}</button></div>
      </div>
    </form>
  );
}

export type HouseValues = { id: number; house_number: number; family_name: string; lat: number; lon: number; battery_model: string; panel_wp: number; installed_on: string; has_data: boolean; node_id: string | null };

export function HouseRow({ h }: { h: HouseValues }) {
  const [state, action, pending] = useActionState<FormResult, FormData>(updateHouse, null);
  const small = { padding: "6px 8px", fontSize: 13 } as const;
  const vals = sent(state);
  const cur = { ...h, ...vals };
  return (
    <form key={JSON.stringify(vals)} action={action} style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", padding: "8px 14px" }}>
      <input type="hidden" name="id" value={h.id} />
      <b style={{ width: 64 }}>Casa {h.house_number}</b>
      <input className="input" name="family_name" defaultValue={cur.family_name} aria-label="Família" style={{ ...small, width: 150 }} />
      <input className="input num" name="lat" defaultValue={typeof cur.lat === "number" ? cur.lat.toFixed(5) : cur.lat} aria-label="Latitude" style={{ ...small, width: 100 }} />
      <input className="input num" name="lon" defaultValue={typeof cur.lon === "number" ? cur.lon.toFixed(5) : cur.lon} aria-label="Longitude" style={{ ...small, width: 100 }} />
      <input className="input" name="battery_model" defaultValue={cur.battery_model} aria-label="Modelo da bateria" style={{ ...small, width: 150 }} />
      <input className="input num" name="panel_wp" defaultValue={cur.panel_wp} aria-label="Wp do painel" style={{ ...small, width: 70 }} />
      <input className="input" type="date" name="installed_on" defaultValue={cur.installed_on} aria-label="Instalação" style={small} />
      <input className="input num" name="node_id" defaultValue={cur.node_id ?? ""} placeholder="nó (ex.: casa-01)" aria-label="Identificador do nó ESP32" style={{ ...small, width: 130 }} />
      <button className="btn small" disabled={pending}>{pending ? "…" : "Salvar"}</button>
      {!h.has_data && <span className="chip" style={{ background: "var(--paper-3)" }}>sem dados ainda</span>}
      {state && <span style={{ fontSize: 12.5, color: state.ok ? "var(--ok-ink)" : "var(--crit-ink)" }}>{state.ok ? state.message : state.error}</span>}
    </form>
  );
}
