"use client";
// Peças pequenas que precisam do navegador.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { Icon } from "@/components/Icon";

export function NavLink({ href, children, exact = false }: { href: string; children: React.ReactNode; exact?: boolean }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return <Link href={href} aria-current={active ? "page" : undefined}>{children}</Link>;
}

export function TabLink({ href, icon, children }: { href: string; icon: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = path === href || (href !== "/agente" && path.startsWith(href));
  return (
    <Link href={href} aria-current={active ? "page" : undefined}>
      <Icon name={icon} />
      {children}
    </Link>
  );
}

export function SignOutButton({ className = "btn small", label = "Sair" }: { className?: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button className={className} disabled={busy} onClick={async () => {
      setBusy(true);
      await authClient.signOut();
      router.push("/auth/sign-in");
      router.refresh();
    }}>
      <Icon name="sair" size={16} /> {label}
    </button>
  );
}

// Lê o texto em voz alta (pt-BR) com a voz do próprio aparelho.
export function SpeakButton({ text, label = "Ouvir em voz alta", className = "icon-btn" }: { text: string; label?: string; className?: string }) {
  return (
    <button type="button" className={className} aria-label={label} title={label} onClick={() => {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "pt-BR";
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    }}>
      <Icon name="falar" />
    </button>
  );
}
