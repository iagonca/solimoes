import { SEVERITY, type Severity } from "@/lib/format";

export function StatusGlyph({ status, size = 26 }: { status: Severity; size?: number }) {
  const s = SEVERITY[status];
  return (
    <span className="glyph" style={{ background: s.bg, color: s.fg, width: size, height: size }} title={s.label}>
      <span aria-hidden="true">{s.glyph}</span>
      <span className="sr">{s.label}</span>
    </span>
  );
}

export function StatusChip({ status, children }: { status: Severity; children?: React.ReactNode }) {
  const s = SEVERITY[status];
  return (
    <span className="chip" style={{ background: s.soft, color: s.ink }}>
      <span aria-hidden="true">{s.glyph}</span>
      {children ?? s.label}
    </span>
  );
}

// Mini-gráfico de linha (SoC nas últimas 24 h), renderizado no servidor.
export function Sparkline({ values, width = 90, height = 22, min = 0, max = 100, guide = 50 }: {
  values: number[] | null; width?: number; height?: number; min?: number; max?: number; guide?: number;
}) {
  if (!values || values.length < 2) return <span className="muted">—</span>;
  const y = (v: number) => height - 1 - ((v - min) / (max - min)) * (height - 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * width).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <line x1="0" x2={width} y1={y(guide)} y2={y(guide)} stroke="var(--rule)" strokeDasharray="2 2" />
      <path d={d} fill="none" stroke="var(--forest)" strokeWidth="1.5" />
    </svg>
  );
}

export function HealthBar({ value, status }: { value: number | null; status: Severity }) {
  if (value === null) return <span className="muted">—</span>;
  return (
    <span className="num">
      <span className="bar"><i style={{ width: `${value}%`, background: SEVERITY[status === "verde" ? "verde" : status].bg }} /></span>
      {value}
    </span>
  );
}
