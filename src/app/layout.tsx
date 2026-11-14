import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Young_Serif } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

// Títulos em Young Serif (só tem peso 400); texto em sans simples; números em mono.
const display = Young_Serif({ subsets: ["latin"], variable: "--font-display", weight: "400" });
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", weight: ["400", "500", "600", "700"] });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-plex-mono", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Solimões · Energia solar que não fica sem manutenção", template: "%s · Solimões" },
  description: "Monitoramento de sistemas solares isolados em comunidades ribeirinhas da Amazônia, com uma ponte entre engenheiros voluntários e agentes locais.",
};

export const viewport: Viewport = { themeColor: "#0B4D3B" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${instrument.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
