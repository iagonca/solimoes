// Formatação em pt-BR. Funções puras, usadas no servidor e no cliente.

export type Severity = "vermelho" | "amarelo" | "cinza" | "verde";

export const SEVERITY: Record<Severity, { label: string; glyph: string; bg: string; fg: string; soft: string; ink: string }> = {
  vermelho: { label: "Crítico", glyph: "◆", bg: "var(--crit)", fg: "#FFFFFF", soft: "var(--crit-soft)", ink: "var(--crit-ink)" },
  amarelo: { label: "Atenção", glyph: "▲", bg: "var(--warn)", fg: "var(--ink)", soft: "var(--warn-soft)", ink: "var(--warn-ink)" },
  cinza: { label: "Offline", glyph: "◌", bg: "var(--off)", fg: "var(--ink)", soft: "var(--off-soft)", ink: "var(--off-ink)" },
  verde: { label: "Normal", glyph: "●", bg: "var(--ok)", fg: "#FFFFFF", soft: "var(--ok-soft)", ink: "var(--ok-ink)" },
};

export const TICKET_STATUS: Record<string, string> = {
  aberto: "Aberto",
  em_analise: "Em análise",
  aguardando_acao_local: "Aguardando ação local",
  resolvido: "Resolvido",
};

const nf = (d: number) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function num(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return nf(digits).format(v);
}

export function pct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined) return "—";
  return `${num(v * 100, digits)}%`;
}

// "há 18 min", relativo ao relógio da aplicação (não ao relógio do navegador).
export function ago(t: Date | string | null, now: Date | string): string {
  if (!t) return "—";
  const ms = new Date(now).getTime() - new Date(t).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 && h < 6 ? `há ${h} h ${min % 60} min` : `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "há 1 dia" : `há ${d} dias`;
}

const TZ = "America/Manaus";

export function clock(t: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(t));
}

export function dayLabel(t: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "short", timeZone: TZ }).format(new Date(t));
}

export function dateShort(t: Date | string): string {
  const d = typeof t === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t) ? new Date(`${t}T12:00:00Z`) : new Date(t);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ }).format(d);
}

export function dateTime(t: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(t));
}

export function weekdayShort(day: string): string {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

// Motivos dos pedidos de ajuda: texto curto e ícone (componente Icon).
export const HELP_REASON: Record<string, { label: string; icon: string }> = {
  sem_luz: { label: "Sem luz", icon: "luz" },
  bateria_apitando: { label: "Bateria apitando", icon: "bateria" },
  aparelho_nao_liga: { label: "Aparelho não liga", icon: "tomada" },
  outro: { label: "Outro problema", icon: "conversa" },
  duvida_protocolo: { label: "Dúvida no protocolo", icon: "guia" },
  problema_tecnico: { label: "Problema técnico", icon: "chave-boca" },
};

export const HELP_STATUS: Record<string, string> = {
  aberto: "Enviado",
  em_atendimento: "Em atendimento",
  resolvido: "Resolvido",
};
