"use client";
import {
  BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend);

export type Series = { label: string; data: (number | null)[]; color: string; fill?: string; dashed?: boolean; axis?: "y" | "y2" };
export type Threshold = { value: number; label: string; color: string };

const INK = "#1E2A22";
const MUTED = "#5B6B5F";
const GRID = "rgba(30,42,34,0.08)";
const FONT = { family: "IBM Plex Mono, ui-monospace, monospace", size: 10 };

export function TimeChart({ labels, series, thresholds = [], min, max, unit, tall = false, y2 }: {
  labels: string[]; series: Series[]; thresholds?: Threshold[]; min?: number; max?: number; unit?: string; tall?: boolean;
  y2?: { min?: number; max?: number; unit?: string };
}) {
  const datasets = [
    ...series.map((s) => ({
      label: s.label, data: s.data, borderColor: s.color, backgroundColor: s.fill ?? "transparent", fill: !!s.fill,
      borderWidth: 2, pointRadius: 0, tension: 0.25, borderDash: s.dashed ? [4, 3] : undefined, yAxisID: s.axis ?? "y",
    })),
    ...thresholds.map((t) => ({
      label: t.label, data: labels.map(() => t.value), borderColor: t.color, borderWidth: 1.2, borderDash: [4, 4],
      pointRadius: 0, fill: false, yAxisID: "y",
    })),
  ];
  return (
    <div className={`chart-box${tall ? " tall" : ""}`}>
      <Line
        data={{ labels, datasets }}
        options={{
          responsive: true, maintainAspectRatio: false, animation: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: datasets.length > 1, position: "bottom", labels: { boxWidth: 12, boxHeight: 2, color: INK, font: FONT } },
            tooltip: { backgroundColor: "#F5F7F1", titleColor: INK, bodyColor: INK, borderColor: INK, borderWidth: 1, titleFont: FONT, bodyFont: FONT,
              callbacks: { label: (c) => `${c.dataset.label}: ${c.formattedValue}${unit && c.dataset.yAxisID === "y" ? ` ${unit}` : y2?.unit ? ` ${y2.unit}` : ""}` } },
          },
          scales: {
            x: { ticks: { color: MUTED, font: FONT, maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } },
            y: { min, max, ticks: { color: MUTED, font: FONT, maxTicksLimit: 5 }, grid: { color: GRID },
              title: unit ? { display: true, text: unit, color: MUTED, font: FONT } : undefined },
            ...(y2 ? { y2: { position: "right" as const, min: y2.min, max: y2.max, ticks: { color: MUTED, font: FONT, maxTicksLimit: 5 }, grid: { display: false },
              title: y2.unit ? { display: true, text: y2.unit, color: MUTED, font: FONT } : undefined } } : {}),
          },
        }}
      />
    </div>
  );
}

export function BarChart({ labels, values, color, unit, line, lineLabel, lineUnit }: {
  labels: string[]; values: number[]; color: string; unit?: string; line?: number[]; lineLabel?: string; lineUnit?: string;
}) {
  return (
    <div className="chart-box">
      <Bar
        data={{
          labels,
          datasets: [
            { type: "bar" as const, label: unit ?? "", data: values, backgroundColor: color, borderRadius: 2, yAxisID: "y" },
            ...(line ? [{ type: "line" as const, label: lineLabel ?? "", data: line, borderColor: INK, borderWidth: 1.5, pointRadius: 0, yAxisID: "y2" }] : []),
          ] as never,
        }}
        options={{
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: !!line, position: "bottom", labels: { boxWidth: 12, color: INK, font: FONT } },
            tooltip: { backgroundColor: "#F5F7F1", titleColor: INK, bodyColor: INK, borderColor: INK, borderWidth: 1, titleFont: FONT, bodyFont: FONT } },
          scales: {
            x: { ticks: { color: MUTED, font: FONT, maxTicksLimit: 10, maxRotation: 0 }, grid: { display: false } },
            y: { ticks: { color: MUTED, font: FONT, maxTicksLimit: 5 }, grid: { color: GRID }, title: unit ? { display: true, text: unit, color: MUTED, font: FONT } : undefined },
            ...(line ? { y2: { position: "right" as const, ticks: { color: MUTED, font: FONT, maxTicksLimit: 5 }, grid: { display: false },
              title: lineUnit ? { display: true, text: lineUnit, color: MUTED, font: FONT } : undefined } } : {}),
          },
        }}
      />
    </div>
  );
}
