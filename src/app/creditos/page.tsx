/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "@/components/PublicShell";
import { CREDITS } from "@/lib/photos";
import styles from "../landing.module.css";

export const metadata: Metadata = { title: "Créditos das imagens" };

export default function CreditsPage() {
  return (
    <div className={styles.page}>
      <PublicHeader />
      <main className={styles.section}>
        <div className={styles.wrap}>
          <h1 className={styles.h2}>Créditos das imagens</h1>
          <p className={styles.note} style={{ fontSize: 15 }}>As fotos do site são do Wikimedia Commons e usadas conforme as licenças indicadas.</p>
          <ul style={{ listStyle: "none", padding: 0, margin: "28px 0 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
            {CREDITS.map((c) => (
              <li key={c.src} className="card" style={{ overflow: "hidden" }}>
                <img src={c.img} alt="" style={{ width: "100%", height: 170, objectFit: "cover", display: "block" }} />
                <div style={{ padding: "14px 16px", fontSize: 14.5 }}>
                  <a href={c.src} style={{ fontWeight: 600 }}>{c.what}</a>
                  <div className="muted">{c.who} · <a href={c.licUrl}>{c.lic}</a></div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
