// Recebe os pacotes do ESP32 (POST /api/telemetry).
//
// 1. Confere o token do cabeçalho X-Api-Token contra SOLIMOES_TOKEN.
// 2. Guarda o pacote como chegou em telemetry_raw.
// 3. Acha a casa pelo node_id e converte o pacote numa linha de telemetry, com a
//    duração real do intervalo (samples × 1 s de leitura).
// 4. Reavalia as regras de alerta, no máximo uma vez a cada 30 s.
//
// Formato do pacote: médias/mín/máx de cada grandeza, soc, ah_in, ah_out, load_cut,
// flags (lista de textos) e rint_mohm (null quando não houve degrau de carga).
import { timingSafeEqual } from "node:crypto";
import { pool } from "@/lib/db";

type Stat = { avg?: number | null; min?: number | null; max?: number | null } | null | undefined;
type Packet = {
  node?: unknown; seq?: number; samples?: number; simulated?: boolean;
  bat_v?: Stat; bat_i?: Stat; pan_v?: Stat; pan_i?: Stat; load_i?: Stat;
  bat_t?: Stat; box_t?: Stat; box_rh?: Stat; mid_v?: Stat;
  soc?: number | null; ah_in?: number | null; ah_out?: number | null;
  load_cut?: boolean; flags?: unknown; rint_mohm?: number | null;
};

const SAMPLE_PERIOD_S = 1;        // o firmware lê os sensores a cada 1 s
const MAX_INTERVAL_S = 15 * 60;   // um pacote resume no máximo 15 min
const MAX_BODY_BYTES = 8 * 1024;

function tokenOk(received: string | null): boolean {
  const expected = process.env.SOLIMOES_TOKEN;
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const prod = (a: number | null, b: number | null) => (a === null || b === null ? null : a * b);

export async function POST(request: Request) {
  if (!tokenOk(request.headers.get("x-api-token"))) {
    return Response.json({ error: "token inválido" }, { status: 401 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return Response.json({ error: "pacote grande demais" }, { status: 413 });

  let p: Packet;
  try {
    p = JSON.parse(text);
  } catch {
    await pool.query("insert into telemetry_raw (status, ip) values ('invalido', $1)", [ip]);
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const node = typeof p.node === "string" ? p.node.trim().slice(0, 64) : "";
  if (!node) return Response.json({ error: "campo 'node' obrigatório" }, { status: 400 });

  const sys = (await pool.query<{ id: number; community_id: number }>(
    "select id, community_id from systems where node_id = $1", [node])).rows[0];
  if (!sys) {
    await pool.query("insert into telemetry_raw (node, status, payload, ip) values ($1, 'no_desconhecido', $2, $3)", [node, text, ip]);
    return Response.json({ error: `nó '${node}' não está ligado a nenhuma casa` }, { status: 404 });
  }

  // Conversão do pacote para uma linha de telemetry.
  const avg = (s: Stat) => num(s?.avg);
  const flags = Array.isArray(p.flags) ? p.flags.filter((f): f is string => typeof f === "string") : [];
  const batV = avg(p.bat_v), batI = avg(p.bat_i), panI = avg(p.pan_i), midV = avg(p.mid_v);
  const loadCut = p.load_cut === true || flags.includes("load_cut");
  // Bulk: a bateria está recebendo carga do painel e o controlador não entrou em flutuação.
  const bulk = (batI ?? 0) > 0.05 && (panI ?? 0) > 0.05 && !flags.includes("full_charge");
  const samples = Math.min(Math.max(Math.round(num(p.samples) ?? 5), 1), MAX_INTERVAL_S / SAMPLE_PERIOD_S);
  const rint = num(p.rint_mohm);

  const client = await pool.connect();
  try {
    await client.query("begin");
    const prev = (await client.query<{ flags: number }>(
      "select flags from telemetry where system_id = $1 order by ts desc limit 1", [sys.id])).rows[0];
    const { rows: [row] } = await client.query<{ ts: Date }>(
      `insert into telemetry (system_id, ts, dt_h, v_bat_avg, v_bat_min, v_bat_max, i_bat_avg, p_panel_avg, p_load_avg,
         t_bat_avg, t_bat_max, t_box, rh_box, v_mid_delta, soc, ah_in, ah_out, rint_mohm, flags)
       values ($1, now(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       returning ts`,
      [sys.id, (samples * SAMPLE_PERIOD_S) / 3600, batV, num(p.bat_v?.min), num(p.bat_v?.max), batI,
        prod(avg(p.pan_v), panI), prod(batV, avg(p.load_i)), avg(p.bat_t), num(p.bat_t?.max), avg(p.box_t), avg(p.box_rh),
        midV !== null && batV !== null ? Math.abs(midV - batV / 2) : null,
        num(p.soc), num(p.ah_in) ?? 0, num(p.ah_out) ?? 0,
        rint !== null && rint > 0 && rint < 5000 ? rint : null,
        (loadCut ? 1 : 0) | (bulk ? 2 : 0)]);

    // Eventos da casa: início e fim do corte de carga, carga completa.
    const wasCut = prev ? (prev.flags & 1) === 1 : false;
    if (loadCut && !wasCut) await client.query("insert into events (system_id, ts, kind, detail) values ($1, $2, 'corte_carga', $3)", [sys.id, row.ts, `SoC ${num(p.soc) ?? "?"}%`]);
    if (!loadCut && wasCut) await client.query("insert into events (system_id, ts, kind) values ($1, $2, 'religamento')", [sys.id, row.ts]);
    if (flags.includes("full_charge")) await client.query("insert into events (system_id, ts, kind) values ($1, $2, 'carga_completa')", [sys.id, row.ts]);

    await client.query("update systems set last_seen = $2 where id = $1", [sys.id, row.ts]);
    await client.query("update communities set hub_last_seen = $2 where id = $1", [sys.community_id, row.ts]);
    await client.query("insert into telemetry_raw (node, system_id, status, payload, ip) values ($1, $2, 'gravado', $3, $4)", [node, sys.id, text, ip]);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  // Reavalia os alertas se a última vez foi há mais de 30 s (a trava é atômica no banco).
  const turn = await pool.query(
    `update settings set value = now()::text
     where key = 'last_refresh' and value::timestamptz < now() - interval '30 seconds' returning 1`);
  if (turn.rowCount) await pool.query("select refresh_alerts()");

  return Response.json({ ok: true, house: sys.id, alerts_refreshed: !!turn.rowCount });
}
