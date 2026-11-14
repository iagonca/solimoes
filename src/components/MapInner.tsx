"use client";
import L from "leaflet";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { Severity } from "@/lib/format";

export type MapCommunity = { slug: string; name: string; lat: number; lon: number; status: Severity; houses: number; red: number; yellow: number };
export type MapSystem = { id: number; lat: number; lon: number; status: Severity; house_number: number; family_name: string; community_slug: string };

const COLORS: Record<Severity, { bg: string; fg: string; glyph: string }> = {
  vermelho: { bg: "#B5482F", fg: "#FFFFFF", glyph: "◆" },
  amarelo: { bg: "#E3B341", fg: "#1E2A22", glyph: "▲" },
  cinza: { bg: "#F5F7F1", fg: "#4A5048", glyph: "◌" },
  verde: { bg: "#3E8E5E", fg: "#FFFFFF", glyph: "●" },
};

function pin(status: Severity, size: number, text: string) {
  const c = COLORS[status];
  const dashed = status === "cinza" ? "border-style:dashed;border-width:2px;" : "";
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div class="marker-pin" style="width:${size}px;height:${size}px;background:${c.bg};color:${c.fg};${dashed}">${text}</div>`,
  });
}

function Fit({ points, focus }: { points: [number, number][]; focus?: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.setView(focus, 15);
    else if (points.length) map.fitBounds(L.latLngBounds(points).pad(0.2));
  }, [map, points, focus]);
  return null;
}

export default function MapInner({ communities, systems, focus }: {
  communities: MapCommunity[]; systems: MapSystem[]; focus?: { lat: number; lon: number } | null;
}) {
  const router = useRouter();
  const points = communities.map((c) => [c.lat, c.lon] as [number, number]);
  return (
    <MapContainer center={[-3.7, -64]} zoom={8} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Fit points={points} focus={focus ? [focus.lat, focus.lon] : null} />
      {!focus && communities.map((c) => (
        <Marker key={c.slug} position={[c.lat, c.lon]} icon={pin(c.status, 34, COLORS[c.status].glyph)}
          eventHandlers={{ click: () => router.push(`/painel/comunidade/${c.slug}`) }}
          keyboard title={`${c.name}: ${c.houses} casas`}>
          <Tooltip direction="right" offset={[16, 0]} className="solimoes-tip">
            <b>{c.name}</b> · {c.houses} casas{c.red ? ` · ${c.red} crít.` : ""}{c.yellow ? ` · ${c.yellow} aten.` : ""}
          </Tooltip>
        </Marker>
      ))}
      {focus && systems.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lon]} icon={pin(s.status, 30, String(s.house_number))}
          eventHandlers={{ click: () => router.push(`/painel/sistema/${s.id}`) }}
          keyboard title={`Casa ${s.house_number} · ${s.family_name}`}>
          <Tooltip direction="top" offset={[0, -14]} className="solimoes-tip">Casa {s.house_number} · {s.family_name}</Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
