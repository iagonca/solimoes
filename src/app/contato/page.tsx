import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "@/components/PublicShell";
import styles from "../landing.module.css";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = { title: "Contato" };

export default function ContactPage() {
  return (
    <div className={styles.page}>
      <PublicHeader />
      <main className={styles.section}>
        <div className={`${styles.wrap} ${styles.split}`}>
          <div>
            <p className={styles.kicker2}>Contato</p>
            <h1 className={styles.h2}>Vamos conversar</h1>
            <div className={styles.prose} style={{ marginTop: 18 }}>
              <p>Se você representa uma comunidade, uma concessionária de energia ou um programa de governo e quer acompanhar
                os sistemas solares de perto, conte um pouco sobre o seu caso.</p>
              <p>A mensagem chega à coordenação do projeto, que responde pelo e-mail que você informar.</p>
            </div>
          </div>
          <ContactForm />
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
