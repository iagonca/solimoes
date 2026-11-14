"use client";
import dynamic from "next/dynamic";
import type { MapCommunity, MapSystem } from "@/components/MapInner";

// O Leaflet mexe em window, então só carrega no navegador.
const MapInner = dynamic(() => import("@/components/MapInner"), {
  ssr: false,
  loading: () => <div className="muted" style={{ padding: 16 }}>Carregando mapa…</div>,
});

export function MapView(props: { communities: MapCommunity[]; systems?: MapSystem[]; focus?: { lat: number; lon: number } | null }) {
  return (
    <div className="map-box">
      <MapInner communities={props.communities} systems={props.systems ?? []} focus={props.focus ?? null} />
      <div className="map-legend" aria-hidden="true">
        <span>◆ Crítico</span><span>▲ Atenção</span><span>● Normal</span><span>◌ Offline</span>
      </div>
    </div>
  );
}
