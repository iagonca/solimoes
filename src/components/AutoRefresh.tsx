"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Recarrega os dados da página (sem recarregar o navegador) a cada `seconds` segundos.
// Pausa enquanto a aba está escondida e atualiza assim que ela volta a ficar visível.
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  const [on, setOn] = useState(true);
  const [last, setLast] = useState(() => Date.now());
  const [, tick] = useState(0);

  useEffect(() => {
    if (!on) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setLast(Date.now());
    };
    const id = window.setInterval(refresh, seconds * 1000);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [on, seconds, router]);

  // Só para o "há N s" andar na tela.
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const ago = Math.max(0, Math.round((Date.now() - last) / 1000));
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--muted)" }} aria-live="off">
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: on ? "var(--ok)" : "var(--off)" }} />
      {on ? `Ao vivo · atualizado há ${ago} s` : "Atualização pausada"}
      <button type="button" className="btn small" onClick={() => { setOn(!on); setLast(Date.now()); }}>
        {on ? "Pausar" : "Retomar"}
      </button>
    </span>
  );
}
