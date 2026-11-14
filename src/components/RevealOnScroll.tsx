"use client";
import { useEffect } from "react";

// Revela os elementos marcados com data-reveal quando entram na tela.
// O conteúdo só fica escondido depois que este script marca <html> com .js-reveal,
// então sem JavaScript tudo continua visível. Quem pede menos movimento no sistema não vê animação (CSS).
export function RevealOnScroll() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("js-reveal");
    const items = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("revealed");
            observer.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    items.forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      root.classList.remove("js-reveal");
    };
  }, []);
  return null;
}
