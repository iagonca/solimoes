// Gera os dados de demonstração: 6 comunidades, 48 casas, 30 dias de pacotes
// a cada 15 min, com falhas injetadas (bateria envelhecendo, painel sujo,
// caixa superaquecendo, umidade, hub offline). Também cria os chamados
// históricos, os protocolos e as contas demo no Neon Auth.
//
// O modelo físico é simplificado de propósito, mas segue a proposta:
//   - sol: irradiância senoidal entre 6h e 18h, integrando a H do dia
//   - bateria: banco de 24 V (2 x 12 V em série), SoC por contagem de coulombs
//   - corte de carga pelo nó quando SoC < 50% ou tensão sob carga < 23,0 V
//   - tensão = tensão de circuito aberto + I x Rint
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { Client } from "pg";

config({ path: ".env.local" });

const STEP_H = 0.25; // 15 min
const DAYS = 30;
const TZ_OFFSET_H = -4; // America/Manaus, sem horário de verão

// RNG determinístico, para a demo sair sempre igual.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261114);
const between = (a: number, b: number) => a + (b - a) * rand();
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

type CommunitySeed = {
  slug: string; name: string; municipality: string; lat: number; lon: number;
  agent: string; phone: string; houses: number;
};

const COMMUNITIES: CommunitySeed[] = [
  { slug: "caiambe", name: "São Raimundo do Caiambé", municipality: "Tefé", lat: -3.535, lon: -64.395, agent: "Raimunda Souza", phone: "+55 97 9 0000-0001", houses: 9 },
  { slug: "santa-luzia", name: "Santa Luzia do Baré", municipality: "Tefé", lat: -3.445, lon: -64.6, agent: "José Batista", phone: "+55 97 9 0000-0002", houses: 8 },
  { slug: "boa-esperanca", name: "Boa Esperança", municipality: "Alvarães", lat: -3.6, lon: -64.1, agent: "Antônia Ferreira", phone: "+55 97 9 0000-0003", houses: 7 },
  { slug: "nazare", name: "Nossa Senhora de Nazaré", municipality: "Coari", lat: -3.75, lon: -63.85, agent: "João Monteiro", phone: "+55 97 9 0000-0004", houses: 12 },
  { slug: "ponta-castanha", name: "Ponta da Castanha", municipality: "Coari", lat: -3.86, lon: -63.6, agent: "Lúcia Castro", phone: "+55 97 9 0000-0005", houses: 6 },
  { slug: "mamia", name: "Bom Jesus do Mamiá", municipality: "Coari", lat: -3.95, lon: -63.3, agent: "Benedito Rocha", phone: "+55 97 9 0000-0006", houses: 6 },
];

const SURNAMES = ["Silva", "Souza", "Batista", "Ferreira", "Cruz", "Monteiro", "Gomes", "Tavares",
  "Castro", "Ribeiro", "Nunes", "Barbosa", "Pereira", "Rocha", "Carvalho", "Mendes", "Freitas", "Araújo",
  "Cardoso", "Oliveira", "Costa", "Moraes", "Santos", "Vieira", "Teixeira", "Barros", "Campos", "Duarte"]; // sem Pinheiro, Lima e Alves, que são fixos

// Falhas injetadas, por "comunidade:casa".
type Fault = {
  heatGainEnd?: number;      // ganho térmico da caixa no fim do período (°C por kW/m²)
  capFactor?: number;        // capacidade real / nominal
  rintStart?: number;        // razão Rint/inicial no começo
  rintEnd?: number;          // e no fim
  soilFrom?: number;         // dia em que o painel começa a sujar
  soilEnd?: number;          // fator de geração no fim
  rhEnd?: number;            // umidade da caixa no fim
  heavyLoad?: boolean;       // freezer grande além do que o sistema comporta
};
const FAULTS: Record<string, Fault> = {
  "caiambe:4": { heatGainEnd: 24, rintStart: 1.15, rintEnd: 1.22 },
  "caiambe:2": { capFactor: 0.42, rintStart: 1.28, rintEnd: 1.31, heavyLoad: true },
  "santa-luzia:6": { rintStart: 1.38, rintEnd: 1.54 },
  "boa-esperanca:1": { soilFrom: 22, soilEnd: 0.6 },
  "nazare:9": { rhEnd: 88 },
};
const OFFLINE_COMMUNITY = "ponta-castanha";
const DEMO_EMAILS = ["marina@example.org", "pedro@example.org", "coordenacao@example.org", "raimunda@example.org",
  "joao@example.org", "francisca@example.org", "lima@example.org"];
const OFFLINE_FOR_H = 3.25;

const PROTOCOLS = [
  { code: "P-01", title: "Reapertar e limpar terminais oxidados", minutes: 25, summary: "Terminal frouxo ou com zinabre esquenta e derruba a tensão.",
    steps: [
      { text: "Desligue o disjuntor do painel e depois o das cargas.", icon: "chave" },
      { text: "Coloque luvas e óculos. Não encoste ferramenta nos dois polos ao mesmo tempo.", icon: "luva" },
      { text: "Afrouxe os terminais e limpe o pó branco ou verde com escova e água com bicarbonato.", icon: "escova" },
      { text: "Seque bem, passe vaselina e aperte de novo com firmeza.", icon: "chave-boca" },
      { text: "Religue primeiro as cargas, depois o painel.", icon: "chave" },
    ] },
  { code: "P-02", title: "Limpar os painéis", minutes: 20, summary: "Poeira, folhas e fezes de pássaro reduzem a geração.",
    steps: [
      { text: "Limpe de manhã cedo ou no fim da tarde, com o painel frio.", icon: "sol" },
      { text: "Tire folhas e galhos de cima do painel.", icon: "folha" },
      { text: "Passe pano macio com água limpa. Não use sabão forte nem esponja de aço.", icon: "balde" },
      { text: "Veja se alguma árvore nova está fazendo sombra e avise a engenheira.", icon: "arvore" },
    ] },
  { code: "P-03", title: "Redistribuir as cargas para economizar", minutes: 15, summary: "Conversa com a família para a bateria não descer de 50%.",
    steps: [
      { text: "Explique que a bateria está fraca e que a luz tem prioridade.", icon: "conversa" },
      { text: "Combine desligar o freezer à noite e ligar de novo às 9h, com sol.", icon: "freezer" },
      { text: "TV e rádio só durante o dia enquanto o alerta durar.", icon: "tv" },
      { text: "Carregue celulares entre 10h e 15h.", icon: "celular" },
    ] },
  { code: "P-04", title: "Verificar o nível de eletrólito", minutes: 30, summary: "Só para baterias com tampa. Nível baixo estraga a bateria.",
    steps: [
      { text: "Desligue o painel e as cargas.", icon: "chave" },
      { text: "Use luvas e óculos. O líquido da bateria queima a pele.", icon: "luva" },
      { text: "Abra as tampas e veja se o líquido cobre as placas.", icon: "olho" },
      { text: "Se faltar, complete só com água destilada, até a marca.", icon: "gota" },
      { text: "Feche as tampas e religue.", icon: "chave" },
    ] },
  { code: "P-05", title: "Trocar a sílica da caixa", minutes: 10, summary: "A sílica seca o ar dentro da caixa e protege a eletrônica.",
    steps: [
      { text: "Abra a caixa do controlador.", icon: "caixa" },
      { text: "Troque o saquinho de sílica por um novo (rosa = usado, azul = bom).", icon: "silica" },
      { text: "Confira se a borracha da tampa está inteira e bem encaixada.", icon: "olho" },
      { text: "Feche a caixa apertando todos os parafusos.", icon: "chave-boca" },
    ] },
  { code: "P-06", title: "Reiniciar o hub e conferir a antena", minutes: 15, summary: "Quando a comunidade inteira some do mapa, o problema costuma ser o hub.",
    steps: [
      { text: "Vá até o hub na escola e veja se a luz do aparelho está acesa.", icon: "olho" },
      { text: "Se estiver apagada, confira o cabo de energia e a tomada.", icon: "tomada" },
      { text: "Desligue o hub da tomada, espere 10 segundos e ligue de novo.", icon: "chave" },
      { text: "Veja se a antena continua no alto, firme e sem cabo partido.", icon: "antena" },
    ] },
  { code: "P-07", title: "Ventilar e sombrear a caixa da bateria", minutes: 15, summary: "Bateria acima de 45 °C perde vida muito rápido.",
    steps: [
      { text: "Desligue o freezer na chave da parede.", icon: "freezer" },
      { text: "Abra a tampa lateral da caixa para o ar circular.", icon: "caixa" },
      { text: "Faça uma cobertura de palha para a caixa não pegar sol direto.", icon: "folha" },
      { text: "Ligue o freezer de novo só depois das 17h.", icon: "relogio" },
    ] },
  { code: "P-08", title: "Testar as baterias uma a uma", minutes: 30, summary: "Desequilíbrio no ponto médio indica uma bateria ruim no banco.",
    steps: [
      { text: "Desligue o painel e as cargas e espere 1 hora.", icon: "relogio" },
      { text: "Meça a tensão de cada bateria com o multímetro.", icon: "multimetro" },
      { text: "Anote as duas medidas e envie pela mensagem.", icon: "conversa" },
      { text: "Religue as cargas e depois o painel.", icon: "chave" },
    ] },
];

type Row = (string | number | boolean | null)[];

async function insertMany(client: Client, table: string, cols: string[], rows: Row[], chunk = 900) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params: (string | number | boolean | null)[] = [];
    const values = part.map((r) => {
      const ph = r.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      return `(${ph.join(",")})`;
    });
    await client.query(`insert into ${table} (${cols.join(",")}) values ${values.join(",")}`, params);
  }
}

// Fim da série: hoje, 14:30 em Manaus, para a demo pegar o pico de calor da Casa 4.
// Fim da série simulada: agora, arredondado para baixo de 15 em 15 min. O site usa o relógio
// real (settings.clock = 'live'), então rode o seed antes de cada apresentação.
function demoEnd(): Date {
  const step = 15 * 60_000;
  return new Date(Math.floor(Date.now() / step) * step);
}

function localHour(t: Date) {
  const l = new Date(t.getTime() + TZ_OFFSET_H * 3600_000);
  return l.getUTCHours() + l.getUTCMinutes() / 60;
}
function localDayKey(t: Date) {
  const l = new Date(t.getTime() + TZ_OFFSET_H * 3600_000);
  return l.toISOString().slice(0, 10);
}

// Tensão de circuito aberto de uma bateria de 12 V pela fração de carga.
function ocv12(soc: number) {
  if (soc < 0.25) return 11.55 + soc * 1.8; // cai mais rápido abaixo de 25%
  return 11.75 + soc * 0.95;                // 12,0 @25% · 12,2 @50% · 12,45 @75% · 12,7 @100%
}

async function ensureDemoPassword(): Promise<string> {
  const env = readFileSync(".env.local", "utf8");
  const found = env.match(/^DEMO_PASSWORD=(.+)$/m);
  if (found) return found[1].trim();
  const pw = randomBytes(9).toString("base64url");
  appendFileSync(".env.local", `\n# Senha das contas de demonstração (todas iguais)\nDEMO_PASSWORD=${pw}\n`);
  return pw;
}

async function ensureCookieSecret() {
  const env = readFileSync(".env.local", "utf8");
  if (/^NEON_AUTH_COOKIE_SECRET=/m.test(env)) return;
  appendFileSync(".env.local", `\n# Segredo do cookie de sessão do Neon Auth\nNEON_AUTH_COOKIE_SECRET=${randomBytes(32).toString("base64")}\n`);
}

async function createAuthUser(email: string, name: string, password: string) {
  const base = process.env.NEON_AUTH_BASE_URL;
  if (!base) throw new Error("NEON_AUTH_BASE_URL ausente");
  const res = await fetch(`${base}/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ email, name, password }),
  });
  if (res.ok) return "criada";
  const text = await res.text();
  if (/exist/i.test(text)) return "já existia";
  throw new Error(`falha ao criar ${email}: ${res.status} ${text}`);
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
  await client.connect();

  console.log("limpando tabelas...");
  // Apaga só o que é simulado (comunidades com is_demo). Comunidades e casas reais, como a
  // bancada com o ESP32, e as mensagens de contato ficam intactas.
  await client.query("begin");
  const demo = "(select id from communities where is_demo)";
  const demoSys = `(select id from systems where community_id in ${demo})`;
  const demoAlerts = `(select id from alerts where community_id in ${demo})`;
  await client.query(`delete from ticket_events where ticket_id in (select id from tickets where alert_id in ${demoAlerts})`);
  await client.query(`delete from outbox where community_id in ${demo}`);
  await client.query(`delete from logistics_items where community_id in ${demo}`);
  await client.query(`delete from tickets where alert_id in ${demoAlerts}`);
  await client.query(`delete from alerts where community_id in ${demo}`);
  await client.query(`delete from help_requests where community_id in ${demo}`);
  await client.query(`delete from events where system_id in ${demoSys}`);
  await client.query(`delete from telemetry where system_id in ${demoSys}`);
  await client.query(`delete from appliances where system_id in ${demoSys}`);
  await client.query(`update telemetry_raw set system_id = null where system_id in ${demoSys}`);
  await client.query(`delete from profiles where email = any($1)`, [DEMO_EMAILS]);
  await client.query(`update profiles set community_id = null, system_id = null where community_id in ${demo} or system_id in ${demoSys}`);
  await client.query(`delete from systems where community_id in ${demo}`);
  await client.query(`delete from hub_irradiance where community_id in ${demo}`);
  await client.query(`delete from hub_irradiance_15m where community_id in ${demo}`);
  await client.query(`delete from hub_forecast where community_id in ${demo}`);
  await client.query(`delete from communities where is_demo`);
  await client.query("commit");
  await client.query(`insert into settings (key, value) values ('clock', 'live'), ('diesel_l_per_kwh', '0.4'), ('co2_kg_per_l', '2.7'),
    ('last_refresh', '2000-01-01T00:00:00Z') on conflict (key) do update set value = excluded.value`);

  const end = demoEnd();
  const steps = DAYS * 24 * 4;
  const start = new Date(end.getTime() - steps * STEP_H * 3600_000);

  // Protocolos
  for (const p of PROTOCOLS) {
    await client.query(`insert into protocols (code, title, summary, minutes, steps) values ($1,$2,$3,$4,$5)
       on conflict (code) do update set title = excluded.title, summary = excluded.summary, minutes = excluded.minutes, steps = excluded.steps`,
      [p.code, p.title, p.summary, p.minutes, JSON.stringify(p.steps)]);
  }
  const protoId = new Map<string, number>();
  for (const r of (await client.query<{ id: number; code: string }>("select id, code from protocols")).rows) protoId.set(r.code, r.id);

  const telemetry: Row[] = [];
  const events: Row[] = [];
  const systemIds = new Map<string, number>();
  let surnameIdx = 0;

  for (const c of COMMUNITIES) {
    const nextTrip = new Date(end.getTime() + (5 + Math.floor(rand() * 10)) * 86400_000).toISOString().slice(0, 10);
    const { rows: [com] } = await client.query<{ id: number }>(
      `insert into communities (slug, name, municipality, lat, lon, agent_name, agent_phone, boat_next_trip, is_demo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,true) returning id`,
      [c.slug, c.name, c.municipality, c.lat, c.lon, c.agent, c.phone, nextTrip]);

    // Irradiação diária da comunidade (célula de referência no hub).
    const H = new Map<string, number>();
    for (let d = 0; d <= DAYS; d++) {
      const day = localDayKey(new Date(start.getTime() + d * 86400_000 + 12 * 3600_000));
      const cloudy = rand() < 0.2 && d < DAYS - 3; // últimos 3 dias com sol, para a regra de PR
      H.set(day, cloudy ? between(1.6, 3.2) : between(4.3, 6.1));
    }
    // Irradiância de cada 15 min, igual para todas as casas da comunidade (kW/m²).
    const comNoise = rand() * 10;
    const gCom: number[] = [];
    const irr15: Row[] = [];
    const daily = new Map<string, number>();
    for (let i = 0; i <= steps; i++) {
      const t = new Date(start.getTime() + i * STEP_H * 3600_000);
      const h = localHour(t);
      const day = localDayKey(t);
      const Hd = H.get(day) ?? 5;
      const sunShape = h > 6 && h < 18 ? Math.sin((Math.PI * (h - 6)) / 12) : 0;
      const g = Math.max(0, (Hd / 7.64) * sunShape * (1 + 0.15 * Math.sin(i * 0.7 + comNoise) * (Hd < 3.5 ? 1 : 0.3)));
      gCom.push(g);
      irr15.push([com.id, t.toISOString(), +(g * 1000).toFixed(1)]);
      daily.set(day, (daily.get(day) ?? 0) + g * STEP_H);
    }
    const lastIrr = c.slug === OFFLINE_COMMUNITY ? steps - Math.round(OFFLINE_FOR_H * 4) : steps;
    await insertMany(client, "hub_irradiance_15m", ["community_id", "ts", "w_m2"], irr15.slice(0, lastIrr + 1));
    await insertMany(client, "hub_irradiance", ["community_id", "day", "kwh_m2"],
      [...daily].map(([day, v]) => [com.id, day, Number(v.toFixed(2))]));
    const fc: Row[] = [];
    for (let d = 1; d <= 3; d++) {
      const day = localDayKey(new Date(end.getTime() + d * 86400_000));
      fc.push([com.id, day, Number((d === 2 ? between(2.0, 2.8) : between(4.5, 5.8)).toFixed(2))]);
    }
    await insertMany(client, "hub_forecast", ["community_id", "day", "kwh_m2"], fc);

    for (let n = 1; n <= c.houses; n++) {
      const key = `${c.slug}:${n}`;
      const fault = FAULTS[key] ?? {};
      const family = key === "caiambe:4" ? "Pinheiro" : key === "caiambe:2" ? "Lima" : key === "caiambe:7" ? "Alves"
        : SURNAMES[surnameIdx++ % SURNAMES.length];
      const installed = new Date(end.getTime() - between(220, 620) * 86400_000);
      const ageYears = (end.getTime() - installed.getTime()) / (365 * 86400_000);
      const panelWp = rand() < 0.5 ? 160 : 200;
      const nominalAh = 105;
      const rintInitial = Number(between(28, 33).toFixed(1));
      const hasFreezer = fault.heavyLoad || rand() < 0.6 || key === "caiambe:4";
      const hasTv = rand() < 0.5;

      const { rows: [sys] } = await client.query<{ id: number }>(
        `insert into systems (community_id, house_number, family_name, lat, lon, battery_model, battery_count,
           bank_nominal_v, bank_nominal_ah, panel_count, panel_wp, installed_on, rint_initial_mohm, ah_throughput_offset)
         values ($1,$2,$3,$4,$5,$6,2,24,$7,2,$8,$9,$10,$11) returning id`,
        [com.id, n, family, c.lat + between(-0.004, 0.004), c.lon + between(-0.006, 0.006),
          rand() < 0.5 ? "Moura 12MF105" : "Heliar Freedom DF2500", nominalAh, panelWp,
          installed.toISOString().slice(0, 10), rintInitial, Math.round(ageYears * 365 * 22)]);
      systemIds.set(key, sys.id);

      // Aparelhos
      const ap: Row[] = [
        [sys.id, "luz", "Lâmpadas (3)", 27, true],
        [sys.id, "celular", "Celulares", 10, false],
        [sys.id, "radio", "Rádio", 8, false],
      ];
      if (hasFreezer) ap.push([sys.id, "freezer", fault.heavyLoad ? "Freezer grande" : "Freezer", fault.heavyLoad ? 120 : 30, false]);
      if (hasTv) ap.push([sys.id, "tv", "TV", 45, false]);
      await insertMany(client, "appliances", ["system_id", "kind", "label", "watts", "essential"], ap as Row[]);

      // Estado da simulação
      const capTrue = nominalAh * (fault.capFactor ?? clamp(1 - ageYears * 0.06 + between(-0.03, 0.03), 0.8, 1));
      let socTrue = between(0.7, 0.85);
      let socNode = socTrue;
      let cut = false;
      let lastFullDay = "";
      const offline = c.slug === OFFLINE_COMMUNITY;
      const lastStep = offline ? steps - Math.round(OFFLINE_FOR_H * 4) : steps;
      const noiseSeed = rand() * 10;
      const derate = between(0.78, 0.87); // perdas de cabo, PWM e temperatura do painel

      for (let i = 0; i <= lastStep; i++) {
        const t = new Date(start.getTime() + i * STEP_H * 3600_000);
        const h = localHour(t);
        const frac = i / steps; // 0 → 1 ao longo do período
        const day = localDayKey(t);
        // Sol (o mesmo da célula de referência do hub)
        const sunShape = h > 6 && h < 18 ? Math.sin((Math.PI * (h - 6)) / 12) : 0;
        const G = gCom[i];
        const soil = fault.soilFrom !== undefined && i / 96 > fault.soilFrom
          ? 1 - (1 - (fault.soilEnd ?? 1)) * clamp((i / 96 - fault.soilFrom) / (DAYS - fault.soilFrom), 0, 1)
          : 1;
        const pAvail = Math.max(0, 2 * panelWp * G * derate * soil);

        // Cargas
        const lights = h >= 18 && h < 22 ? 27 : h >= 22 || h < 5.5 ? 5 : 0;
        const phones = (h >= 18 && h < 21) || (h >= 12 && h < 14) ? 10 : 0;
        const radio = h >= 6 && h < 12 ? 8 : 0;
        const freezer = hasFreezer ? (fault.heavyLoad ? 120 : 30) : 0;
        const tv = hasTv && h >= 19 && h < 22 ? 45 : 0;
        const wobble = 1 + 0.08 * Math.sin(i * 1.3 + noiseSeed);
        const pLoad = (cut ? lights : lights + phones + radio + freezer + tv) * wobble;

        // Bateria
        const rintRatio = (fault.rintStart ?? 1 + ageYears * 0.07) +
          ((fault.rintEnd ?? fault.rintStart ?? 1 + ageYears * 0.07) - (fault.rintStart ?? 1 + ageYears * 0.07)) * frac;
        const rOhm = (rintInitial * rintRatio) / 1000;
        const vOcv = 2 * ocv12(socTrue);
        let pPanel = pAvail;
        let iBat = (pAvail - pLoad) / vOcv;
        let floating = false;
        if (socTrue >= 0.995 && iBat > 0) { iBat = 0; pPanel = pLoad; floating = true; } // flutuação: o controlador limita
        const bulk = !floating && iBat > 0 && pAvail > 0; // painel entregando tudo o que pode
        const ahIn = iBat > 0 ? iBat * STEP_H : 0;
        const ahOut = iBat < 0 ? -iBat * STEP_H : 0;
        socTrue = clamp(socTrue + (ahIn * 0.85 - ahOut) / capTrue, 0.05, 1);
        socNode = clamp(socNode + (ahIn * 0.85 - ahOut) / nominalAh, 0, 1);
        if (socTrue >= 0.995 && day !== lastFullDay) {
          socNode = 1; // recalibra na carga completa
          lastFullDay = day;
          events.push([sys.id, t.toISOString(), "carga_completa", null]);
        }

        let vBat = vOcv + iBat * rOhm;
        if (iBat > 0) vBat += 0.5 + 0.9 * socTrue; // absorção
        if (socTrue >= 0.995 && G > 0.05) vBat = 27.0;
        const vMin = vBat - (iBat < 0 ? 0.25 + Math.abs(iBat) * rOhm * 1.5 : 0.05);
        const vMax = vBat + 0.08;

        // Corte de carga pelo nó
        const shouldCut = socNode < 0.5 || vMin < 23.0;
        if (!cut && shouldCut) { cut = true; events.push([sys.id, t.toISOString(), "corte_carga", `SoC ${Math.round(socNode * 100)}%, ${vMin.toFixed(2)} V`]); }
        else if (cut && socNode > 0.6 && iBat > 0) { cut = false; events.push([sys.id, t.toISOString(), "religamento", null]); }

        // Temperaturas e umidade
        const ambient = 25.5 + 5.5 * Math.max(0, Math.sin((Math.PI * (h - 8)) / 12)) + 0.6 * Math.sin(i * 0.11 + noiseSeed);
        const heatGain = fault.heatGainEnd ? 6 + (fault.heatGainEnd - 6) * clamp((frac - 0.85) / 0.15, 0, 1) : between(5, 7);
        const tBat = ambient + 1.5 + heatGain * G + Math.abs(iBat) * 0.05;
        const rhBase = 68 + 10 * (h < 7 || h > 20 ? 1 : 0) - 6 * sunShape;
        const rh = fault.rhEnd ? rhBase + (fault.rhEnd - rhBase) * clamp((frac - 0.6) / 0.4, 0, 1) : rhBase + between(-2, 2);
        const vMid = between(0.02, 0.08);

        // Rint medido no degrau das 18h (luz acendendo)
        const rintSample = Math.abs(h - 18) < 0.01 ? rintInitial * rintRatio * (1 + between(-0.03, 0.03)) : null;

        telemetry.push([sys.id, t.toISOString(),
          +vBat.toFixed(2), +vMin.toFixed(2), +vMax.toFixed(2), +iBat.toFixed(2),
          +pPanel.toFixed(1), +pLoad.toFixed(1), +tBat.toFixed(1), +(tBat + 0.4).toFixed(1), +(tBat + 1).toFixed(1),
          +rh.toFixed(1), +vMid.toFixed(3), +(socNode * 100).toFixed(1), +ahIn.toFixed(3), +ahOut.toFixed(3),
          rintSample === null ? null : +rintSample.toFixed(1), (cut ? 1 : 0) | (bulk ? 2 : 0)]);
      }
      const lastSeen = new Date(start.getTime() + lastStep * STEP_H * 3600_000);
      await client.query("update systems set last_seen = $2 where id = $1", [sys.id, lastSeen.toISOString()]);
      if (n === c.houses) await client.query("update communities set hub_last_seen = $2 where id = $1", [com.id, lastSeen.toISOString()]);
    }
  }

  console.log(`inserindo ${telemetry.length} pacotes de telemetria...`);
  await insertMany(client, "telemetry",
    ["system_id", "ts", "v_bat_avg", "v_bat_min", "v_bat_max", "i_bat_avg", "p_panel_avg", "p_load_avg",
      "t_bat_avg", "t_bat_max", "t_box", "rh_box", "v_mid_delta", "soc", "ah_in", "ah_out", "rint_mohm", "flags"],
    telemetry);
  await insertMany(client, "events", ["system_id", "ts", "kind", "detail"], events);
  // "Agora" da demo: o último pacote gerado (lido por app_now()).
  await client.query("insert into settings (key, value) values ('demo_now', $1) on conflict (key) do update set value = excluded.value", [end.toISOString()]);

  // Chamados históricos já resolvidos (últimos 30 dias), para a fila e o impacto.
  console.log("criando histórico de chamados...");
  const comIds = new Map<string, number>();
  for (const r of (await client.query<{ id: number; slug: string }>("select id, slug from communities")).rows) comIds.set(r.slug, r.id);
  const history = [
    ["mamia", 2, "pr_baixo", "amarelo", "Desempenho do painel abaixo de 70% por 3 dias de sol", "P-02", "Painel com folhas de mangueira acumuladas.", true],
    ["nazare", 3, "desequilibrio", "amarelo", "Desequilíbrio no ponto médio acima de 0,3 V", "P-01", "Terminal da bateria 2 oxidado; após limpeza ΔV caiu de 0,41 para 0,08 V.", true],
    ["caiambe", 7, "umidade", "amarelo", "Umidade interna da caixa acima de 85%", "P-05", "Sílica saturada.", true],
    ["santa-luzia", 2, "soc_baixo", "amarelo", "Bateria abaixo de 50% há mais de 12 h", "P-03", "Família comprou TV nova; combinado uso só de dia.", true],
    ["boa-esperanca", 4, "pr_baixo", "amarelo", "Desempenho do painel abaixo de 70% por 3 dias de sol", "P-02", "Sombra de açaizeiro novo; poda feita.", true],
    ["nazare", 11, "temp_alta", "vermelho", "Temperatura da bateria acima de 45 °C", "P-07", "Caixa instalada na parede oeste; sombreada com palha.", true],
    ["mamia", 5, "corte_carga", "vermelho", "Tensão crítica sob carga (corte acionado)", "P-03", "Freezer emprestado do vizinho ligado na casa.", true],
    ["ponta-castanha", 1, "no_offline", "cinza", "Nó sem comunicar há mais de 2 h", "P-06", "Fonte do nó desconectada durante limpeza.", true],
    ["caiambe", 3, "desequilibrio", "amarelo", "Desequilíbrio no ponto médio acima de 0,3 V", "P-08", "Bateria 1 com célula fraca; troca prevista.", false],
    ["nazare", 6, "umidade", "amarelo", "Umidade interna da caixa acima de 85%", "P-05", "Vedação rasgada; trocada.", true],
    ["santa-luzia", 4, "pr_baixo", "amarelo", "Desempenho do painel abaixo de 70% por 3 dias de sol", "P-02", "Poeira da roça queimada.", true],
    ["boa-esperanca", 6, "soc_baixo", "amarelo", "Bateria abaixo de 50% há mais de 12 h", "P-03", "Semana chuvosa; orientação de consumo.", true],
    ["mamia", 1, "umidade", "amarelo", "Umidade interna da caixa acima de 85%", "P-05", "Sílica saturada.", true],
    ["nazare", 2, "corte_carga", "vermelho", "Tensão crítica sob carga (corte acionado)", "P-01", "Terminal frouxo causando queda de tensão.", true],
    ["caiambe", 9, "pr_baixo", "amarelo", "Desempenho do painel abaixo de 70% por 3 dias de sol", "P-02", "Fezes de pássaro no painel.", false],
    ["santa-luzia", 8, "desequilibrio", "amarelo", "Desequilíbrio no ponto médio acima de 0,3 V", "P-01", "Cabo de interligação com mau contato.", true],
    ["nazare", 10, "pr_baixo", "amarelo", "Desempenho do painel abaixo de 70% por 3 dias de sol", "P-02", "Painel sujo de fuligem.", true],
  ] as const;
  const engineers = ["marina@example.org", "pedro@example.org"];
  for (let k = 0; k < history.length; k++) {
    const [slug, house, rule, sev, title, proto, diag, improved] = history[k];
    const sid = systemIds.get(`${slug}:${house}`)!;
    const opened = new Date(end.getTime() - (28 - k * 1.5) * 86400_000);
    const analysed = new Date(opened.getTime() + 3 * 3600_000);
    const done = new Date(opened.getTime() + 30 * 3600_000);
    const closed = new Date(done.getTime() + 8 * 3600_000);
    const { rows: [a] } = await client.query<{ id: number }>(
      `insert into alerts (community_id, system_id, rule, severity, title, action, opened_at, closed_at)
       values ($1,$2,$3,$4,$5,'',$6,$7) returning id`,
      [comIds.get(slug), sid, rule, sev, title, opened.toISOString(), improved ? closed.toISOString() : null]);
    if (!improved) {
      // não melhorou: o alerta original foi fechado mais tarde por outra intervenção
      await client.query("update alerts set closed_at = $2 where id = $1", [a.id, new Date(Math.min(closed.getTime() + 4 * 86400_000, end.getTime() - 86400_000)).toISOString()]);
    }
    const eng = engineers[k % 2];
    const { rows: [t] } = await client.query<{ id: number }>(
      `insert into tickets (alert_id, status, assignee_email, diagnosis, protocol_id, current_step, created_at, updated_at,
         local_done_at, resolved_at, verified_improved)
       values ($1,'resolvido',$2,$3,$4,99,$5,$6,$6,$6,$7) returning id`,
      [a.id, eng, diag, protoId.get(proto), opened.toISOString(), done.toISOString(), improved]);
    await insertMany(client, "ticket_events", ["ticket_id", "ts", "actor", "kind", "note"], [
      [t.id, opened.toISOString(), "sistema", "aberto", title],
      [t.id, analysed.toISOString(), eng, "em_analise", null],
      [t.id, new Date(analysed.getTime() + 3600_000).toISOString(), eng, "aguardando_acao_local", `Protocolo ${proto} enviado ao agente local.`],
      [t.id, done.toISOString(), "agente local", "resolvido", "Agente confirmou a execução."],
      [t.id, new Date(done.getTime() + 6 * 3600_000).toISOString(), "sistema", "verificacao",
        improved ? "Os dados melhoraram depois da intervenção." : "Os dados não melhoraram; reabrir se persistir."],
    ]);
  }

  // Avalia as regras sobre os dados gerados: abre os alertas atuais e seus chamados.
  console.log("avaliando regras de alerta...");
  await client.query("select refresh_alerts()");

  // Ajusta os horários de abertura para o que a série mostra e coloca cada chamado atual no seu estado.
  const openTimes: Record<string, number> = { temp_alta: 0.3, corte_carga: 1, soc_baixo: 4, hub_offline: OFFLINE_FOR_H, pr_baixo: 48, rint_alta: 120, umidade: 6 };
  await client.query(`update alerts a set opened_at = app_now() - make_interval(secs => ($1::jsonb ->> a.rule)::float * 3600)
                      where a.closed_at is null and ($1::jsonb ? a.rule)`, [JSON.stringify(openTimes)]);
  await client.query(`update tickets t set created_at = a.opened_at, updated_at = a.opened_at
                      from alerts a where a.id = t.alert_id and a.closed_at is null`);
  await client.query(`update ticket_events e set ts = t.created_at from tickets t, alerts a
                      where e.ticket_id = t.id and a.id = t.alert_id and a.closed_at is null and e.kind = 'aberto'`);

  async function advance(slug: string, house: number | null, rule: string, status: string, eng: string,
    diagnosis: string | null, proto: string | null) {
    const { rows } = await client.query<{ id: number; created_at: Date }>(
      `select t.id, t.created_at from tickets t join alerts a on a.id = t.alert_id
       where a.closed_at is null and a.rule = $1 and a.community_id = $2 and coalesce(a.system_id, 0) = $3`,
      [rule, comIds.get(slug), house === null ? 0 : systemIds.get(`${slug}:${house}`)]);
    if (!rows[0]) { console.warn(`  chamado não encontrado: ${slug} ${house} ${rule}`); return; }
    const tk = rows[0];
    const t1 = new Date(new Date(tk.created_at).getTime() + 10 * 60_000);
    await client.query(`update tickets set status = $2, assignee_email = $3, diagnosis = $4, protocol_id = $5, updated_at = $6 where id = $1`,
      [tk.id, status, eng, diagnosis, proto ? protoId.get(proto) : null, t1.toISOString()]);
    await client.query(`insert into ticket_events (ticket_id, ts, actor, kind, note) values ($1,$2,$3,'em_analise',null)`, [tk.id, t1.toISOString(), eng]);
    if (status === "aguardando_acao_local") {
      const t2 = new Date(t1.getTime() + 5 * 60_000);
      await client.query(`insert into ticket_events (ticket_id, ts, actor, kind, note) values ($1,$2,$3,'aguardando_acao_local',$4)`,
        [tk.id, t2.toISOString(), eng, `Protocolo ${proto} enviado ao agente local.`]);
      const proto_ = PROTOCOLS.find((p) => p.code === proto)!;
      await client.query(`insert into outbox (community_id, ticket_id, channel, body, queued_at, sent_at) values ($1,$2,'whatsapp',$3,$4,$4)`,
        [comIds.get(slug), tk.id, `Solimões: ${proto_.title} na Casa ${house}. Abra o app para ver os passos.`, t2.toISOString()]);
    }
  }
  await advance("caiambe", 4, "temp_alta", "aguardando_acao_local", "marina@example.org",
    "Caixa da bateria pegando sol da tarde; temperatura passa de 45 °C entre 13h e 16h. Ventilar e sombrear antes de pensar em troca.", "P-07");
  await advance("santa-luzia", 6, "rint_alta", "em_analise", "marina@example.org",
    "Rint subindo de forma contínua há 30 dias. Provável fim de vida; confirmar com teste individual.", null);
  await advance("ponta-castanha", null, "hub_offline", "em_analise", "pedro@example.org", null, null);
  await advance("boa-esperanca", 1, "pr_baixo", "aguardando_acao_local", "pedro@example.org",
    "Só esta casa caiu com sol pleno nas outras: sujeira ou sombra local.", "P-02");
  await advance("nazare", 9, "umidade", "aguardando_acao_local", "marina@example.org",
    "Umidade sobe toda noite e não baixa de dia: sílica saturada ou vedação.", "P-05");

  // Logística da próxima viagem de barco
  await insertMany(client, "logistics_items", ["community_id", "item", "qty", "status"], [
    [comIds.get("caiambe")!, "Bateria 12 V 105 Ah (Casa 2)", 2, "pendente"],
    [comIds.get("caiambe")!, "Fusível 20 A", 4, "embarcado"],
    [comIds.get("caiambe")!, "Bateria 12 V 105 Ah (Casa 3)", 1, "pendente"],
    [comIds.get("santa-luzia")!, "Bateria 12 V 105 Ah (Casa 6)", 2, "pendente"],
    [comIds.get("nazare")!, "Sílica gel 50 g", 10, "embarcado"],
    [comIds.get("nazare")!, "Borracha de vedação da caixa", 2, "pendente"],
    [comIds.get("boa-esperanca")!, "Escova macia e rodo para painel", 1, "pendente"],
    [comIds.get("ponta-castanha")!, "Antena LoRa 915 MHz de reserva", 1, "pendente"],
    [comIds.get("ponta-castanha")!, "Fonte 5 V para o hub", 1, "pendente"],
    [comIds.get("mamia")!, "Terminais de bateria", 4, "entregue"],
  ] as Row[]);

  // Contas demo e perfis
  console.log("criando contas demo no Neon Auth...");
  await ensureCookieSecret();
  const password = await ensureDemoPassword();
  const accounts: [string, string, string, string | null, string | null][] = [
    ["marina@example.org", "Marina Tavares", "engenheiro", null, null],
    ["pedro@example.org", "Pedro Albuquerque", "engenheiro", null, null],
    ["coordenacao@example.org", "Helena Prado", "coordenador", null, null],
    ["raimunda@example.org", "Raimunda Souza", "agente", "caiambe", null],
    ["joao@example.org", "João Monteiro", "agente", "nazare", null],
    ["francisca@example.org", "Dona Francisca Alves", "morador", "caiambe", "caiambe:7"],
    ["lima@example.org", "Família Lima", "morador", "caiambe", "caiambe:2"],
  ];
  for (const [email, name, role, slug, sys] of accounts) {
    const status = await createAuthUser(email, name, password);
    await client.query(`insert into profiles (email, display_name, role, community_id, system_id) values ($1,$2,$3,$4,$5)
       on conflict (email) do update set display_name = excluded.display_name, role = excluded.role,
         community_id = excluded.community_id, system_id = excluded.system_id, active = true`,
      [email, name, role, slug ? comIds.get(slug) : null, sys ? systemIds.get(sys) : null]);
    console.log(`  ${email} (${role}): ${status}`);
  }

  // Um pedido de ajuda de morador em aberto, para a demo.
  await client.query(
    `insert into help_requests (community_id, system_id, requester_email, requester_role, target, reason, note, created_at, updated_at)
     values ($1, $2, 'lima@example.org', 'morador', 'agente_engenharia', 'bateria_apitando', 'Apita toda noite quando liga o freezer.',
             app_now() - interval '40 minutes', app_now() - interval '40 minutes')`,
    [comIds.get("caiambe"), systemIds.get("caiambe:2")]);

  const { rows: summary } = await client.query(
    `select a.severity, a.title, c.name as community, s.house_number
     from alerts a join communities c on c.id = a.community_id left join systems s on s.id = a.system_id
     where a.closed_at is null order by severity_rank(a.severity) desc`);
  console.log("alertas abertos:");
  for (const r of summary) console.log(`  [${r.severity}] ${r.title} — ${r.community}${r.house_number ? ` · Casa ${r.house_number}` : ""}`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
