/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PublicFooter, PublicHeader } from "@/components/PublicShell";
import { RevealOnScroll } from "@/components/RevealOnScroll";
import { num } from "@/lib/format";
import { PHOTOS } from "@/lib/photos";
import { getImpact } from "@/lib/queries";
import styles from "./landing.module.css";

export const metadata: Metadata = { title: { absolute: "Solimões · Energia solar que não fica sem manutenção" } };
export const dynamic = "force-dynamic";

export default async function Landing() {
  const impact = await getImpact();
  const counters = [
    { icon: "casa", v: String(impact.systems), l: "casas monitoradas" },
    { icon: "mapa", v: String(impact.communities), l: "comunidades no mapa" },
    { icon: "sol", v: num(impact.kwh_30d, 0), l: "kWh gerados em 30 dias" },
    { icon: "gota", v: num(impact.diesel_l_30d, 0), l: "litros de diesel evitados" },
    { icon: "check", v: String(impact.tickets_resolved_30d), l: "chamados resolvidos em 30 dias" },
  ];

  return (
    <div className={styles.page}>
      <RevealOnScroll />
      <PublicHeader />

      <section className={styles.hero} aria-label="Apresentação">
        <img src={PHOTOS.hero} alt="Vista aérea do rio Solimões cortando a floresta" className={styles.heroImg} />
        <div className={styles.heroShade} />
        <div className={`${styles.wrap} ${styles.heroText}`}>
          <p className={styles.kicker}>Comunidades ribeirinhas da Amazônia</p>
          <h1>Energia solar que não fica sem manutenção</h1>
          <p className={styles.lead}>
            Monitoramento de baixo custo que avisa antes de a luz apagar e orienta o conserto passo a passo, para manter
            acesos os sistemas solares das comunidades.
          </p>
          <ul className={styles.heroSteps} aria-label="Como funciona, em resumo">
            <li><Icon name="bateria" size={20} stroke={2} /> Sensor em cada casa</li>
            <li><Icon name="chamado" size={20} stroke={2} /> Engenheiros analisam de longe</li>
            <li><Icon name="pessoas" size={20} stroke={2} /> Agente local conserta</li>
          </ul>
          <div className={styles.ctas}>
            <Link href="/auth/sign-in" className="btn accent" style={{ minHeight: 52, padding: "0 26px", fontSize: 16 }}>Entrar na plataforma</Link>
            <a href="#como-funciona" className={`btn ${styles.ghost}`} style={{ minHeight: 52, padding: "0 26px", fontSize: 16 }}>Ver como funciona</a>
          </div>
        </div>
      </section>

      <div className={`stripes ${styles.band}`} aria-hidden="true" />

      <section className={styles.section}>
        <div className={`${styles.wrap} ${styles.split}`} data-reveal="">
          <div>
            <p className={styles.kicker2}>O problema</p>
            <h2 className={styles.h2}>Depois da instalação, a manutenção não chega</h2>
          </div>
          <div className={styles.prose}>
            <p>Em comunidades isoladas, a bateria pode se estragar com o calor, com descargas profundas ou com um aparelho novo
              que o sistema não aguenta, e ninguém percebe até a luz apagar. A viagem de barco até lá é longa e cara, e muitas
              vezes chega sem a peça certa.</p>
            <p>Com o Solimões, cada casa envia o estado de carga, a temperatura e a resistência interna da bateria e o
              desempenho do painel. Assim o problema aparece antes, o diagnóstico é feito de longe e o barco já sai levando o
              que precisa.</p>
          </div>
        </div>
      </section>

      <section id="impacto" className={`${styles.section} ${styles.counters}`} aria-label="Números">
        <div className={styles.wrap}>
          <h2 className={styles.h2} style={{ color: "var(--forest)" }} data-reveal="">Em números</h2>
          <ul className={styles.counterGrid}>
            {counters.map((c, i) => (
              <li key={c.l} data-reveal="" style={{ ["--d" as string]: `${i * 90}ms` }}>
                <span className={styles.badge}><Icon name={c.icon} size={30} stroke={2} /></span>
                <div>
                  <div className={styles.counterValue}>{c.v}</div>
                  <div className={styles.counterLabel}>{c.l}</div>
                </div>
              </li>
            ))}
          </ul>
          <p className={styles.note}>Os números vêm dos dados que as próprias casas enviam. <Link href="/impacto">Ver todos os indicadores →</Link></p>
        </div>
      </section>

      <section id="como-funciona" className={styles.section}>
        <div className={styles.wrap}>
          <div data-reveal=""><p className={styles.kicker2}>Como funciona</p>
          <h2 className={styles.h2}>Do sensor ao conserto, em quatro passos</h2></div>
          <ol className={styles.steps}>
            {[
              ["bateria", "Nó na casa", "Um ESP32 mede bateria, painel e temperatura. Quando a carga fica baixa, ele mesmo desliga os aparelhos menos importantes para proteger a bateria."],
              ["antena", "Hub da comunidade", "Recebe os dados das casas por rádio LoRa e manda por satélite. Se a conexão cair, guarda tudo e envia quando voltar."],
              ["chamado", "Equipe técnica", "Cada alerta vira um chamado. O engenheiro olha os gráficos, escreve o diagnóstico e escolhe o protocolo de conserto."],
              ["pessoas", "Agente local", "Recebe o passo a passo ilustrado no celular, faz o conserto e confirma. Depois, o sistema confere se os dados melhoraram."],
            ].map(([icon, t, d], i) => (
              <li key={t} data-reveal="" style={{ ["--d" as string]: `${i * 110}ms` }}>
                <span className={styles.stepNum}>{i + 1}</span>
                <span className={styles.badgeSm}><Icon name={icon} size={24} stroke={2} /></span>
                <h3>{t}</h3>
                <p>{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.photoBand} aria-label="Comunidade ribeirinha">
        <img src={PHOTOS.community} alt="Casas de madeira flutuando à beira de um rio amazônico, com a floresta ao fundo" />
        <div className={styles.photoCard} data-reveal="">
          <p className={styles.kicker2}>Feito com a comunidade</p>
          <h2 className={styles.h2} style={{ fontSize: 30 }}>Quem mora lá entende o sistema</h2>
          <p>Na tela do morador, a bateria aparece dividida em partes, com ícones e leitura em voz alta, e ele sabe o que dá
            para ligar à noite. Se algo der errado, pede ajuda com um toque, e o pedido chega ao agente local e à equipe técnica.</p>
        </div>
      </section>

      <section id="para-quem" className={styles.section}>
        <div className={styles.wrap}>
          <div data-reveal=""><p className={styles.kicker2}>Para quem</p>
          <h2 className={styles.h2}>Uma ponte entre quem usa, quem mantém e quem financia</h2></div>
          <div className={styles.audiences}>
            <article data-reveal="" style={{ ["--d" as string]: "0ms" }}>
              <span className={styles.badgeSm}><Icon name="casa" size={24} stroke={2} /></span>
              <h3>Comunidades</h3>
              <ul>
                <li>Energia que dura mais, porque o problema aparece antes de a bateria morrer</li>
                <li>Uma tela simples para o morador, com ícones e leitura em voz alta</li>
                <li>O agente local recebe o passo a passo e os pedidos de ajuda no próprio app</li>
              </ul>
            </article>
            <article data-reveal="" style={{ ["--d" as string]: "110ms" }}>
              <span className={styles.badgeSm}><Icon name="bateria" size={24} stroke={2} /></span>
              <h3>Concessionárias de energia</h3>
              <ul>
                <li>Manutenção dos sistemas individuais (SIGFI) feita antes da falha, e não depois</li>
                <li>Histórico de cada sistema, com a saúde da bateria, a resistência interna e o desempenho do painel</li>
                <li>Viagens de barco planejadas, com a lista de peças pronta antes de sair</li>
              </ul>
            </article>
            <article data-reveal="" style={{ ["--d" as string]: "220ms" }}>
              <span className={styles.badgeSm}><Icon name="impacto" size={24} stroke={2} /></span>
              <h3>Governo e programas</h3>
              <ul>
                <li>Dá para acompanhar quem continua com energia depois da instalação</li>
                <li>Indicadores públicos de energia gerada, diesel e CO₂ evitados e chamados resolvidos</li>
                <li>O cuidado fica na mão de agentes da própria comunidade</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.final}`} aria-label="Comece agora">
        <img src={PHOTOS.river} alt="" className={styles.finalImg} />
        <div className={styles.finalShade} />
        <div className={`${styles.wrap} ${styles.finalText}`} data-reveal="">
          <h2 className={styles.h2} style={{ color: "#fff" }}>Conheça a plataforma por dentro</h2>
          <p>Entre com a sua conta para acompanhar os sistemas, ou escreva para a gente para levar o Solimões à sua comunidade, concessionária ou programa.</p>
          <div className={styles.ctas}>
            <Link href="/auth/sign-in" className="btn accent" style={{ minHeight: 52, padding: "0 26px", fontSize: 16 }}>Entrar</Link>
            <Link href="/contato" className={`btn ${styles.ghost}`} style={{ minHeight: 52, padding: "0 26px", fontSize: 16 }}>Fale com a gente</Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
