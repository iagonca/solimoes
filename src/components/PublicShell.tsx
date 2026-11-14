import Link from "next/link";
import styles from "@/app/landing.module.css";

// Cabeçalho e rodapé das páginas públicas (início, contato, créditos).
export function PublicHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.wrap}>
        <Link href="/" className={styles.brand}><Logo /><span>Solimões</span></Link>
        <nav aria-label="Seções" className={styles.nav}>
          <Link href="/#como-funciona">Como funciona</Link>
          <Link href="/#para-quem">Para quem</Link>
          <Link href="/impacto">Impacto</Link>
          <Link href="/contato">Contato</Link>
        </nav>
        <Link href="/auth/sign-in" className="btn accent">Entrar</Link>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.wrap}>
        <div className={styles.footerTop}>
          <Link href="/" className={styles.brand}><Logo /><span>Solimões</span></Link>
          <span>Monitoramento de energia solar em comunidades ribeirinhas · Amazonas</span>
        </div>
        <nav aria-label="Rodapé" className={styles.footerLinks}>
          <Link href="/contato">Contato</Link>
          <Link href="/impacto">Indicadores de impacto</Link>
          <Link href="/auth/sign-in">Entrar</Link>
          <Link href="/creditos">Créditos das imagens</Link>
        </nav>
      </div>
    </footer>
  );
}

export function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 34 34" fill="none" stroke="#B9DD72" strokeWidth="2" aria-hidden="true">
      <path d="M3 22c5-3 9-3 14 0s9 3 14 0" /><path d="M3 27c5-3 9-3 14 0s9 3 14 0" />
      <path d="M17 4c-5 4-6 9-1 14 5-5 4-10 1-14z" /><path d="M17 18V9" />
    </svg>
  );
}
