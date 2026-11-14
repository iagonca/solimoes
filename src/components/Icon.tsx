// Ícones de traço, desenhados para este projeto. Tamanho e cor vêm do uso.
type Props = { name: string; size?: number; stroke?: number; className?: string; label?: string };

const PATHS: Record<string, React.ReactNode> = {
  luz: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.6 1 2.5h6c0-.9.2-1.7 1-2.5A6 6 0 0 0 12 3z" /></>,
  celular: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,
  freezer: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M5 10h14M9 5v2M9 13v3" /></>,
  tv: <><rect x="2" y="5" width="20" height="13" rx="2" /><path d="M8 22h8M12 18v4" /></>,
  radio: <><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M7 8l9-5" /><circle cx="15" cy="14" r="3" /><path d="M6 12h3M6 16h3" /></>,
  ventilador: <><circle cx="12" cy="12" r="2" /><path d="M12 10c0-4 2-7 5-6s1 6-3 7M14 12c4 0 7 2 6 5s-6 1-7-3M12 14c0 4-2 7-5 6s-1-6 3-7M10 12c-4 0-7-2-6-5s6-1 7 3" /></>,
  chave: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M12 7v5" /><circle cx="12" cy="15" r="1" /></>,
  luva: <path d="M7 21v-7l-2-4a1.5 1.5 0 0 1 2.6-1.5L9 10V4a1.5 1.5 0 0 1 3 0v5-6a1.5 1.5 0 0 1 3 0v6-4a1.5 1.5 0 0 1 3 0v9c0 4-2 7-6 7H7z" />,
  escova: <><path d="M4 20l8-8" /><rect x="11" y="4" width="9" height="9" rx="1" transform="rotate(45 15.5 8.5)" /></>,
  "chave-boca": <path d="M14.5 5.5a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3l9-9a4 4 0 0 1-2-2z" />,
  sol: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" /></>,
  nuvem: <path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.5A3.3 3.3 0 0 0 7 18z" />,
  folha: <><path d="M5 19c0-9 5-14 15-15-1 10-6 15-15 15z" /><path d="M5 19l8-8" /></>,
  balde: <><path d="M5 8h14l-2 13H7z" /><path d="M8 8a4 4 0 0 1 8 0" /></>,
  arvore: <><path d="M12 22v-6" /><path d="M12 2l6 9h-3l4 5H5l4-5H6z" /></>,
  conversa: <path d="M4 5h16v11H9l-5 4z" />,
  olho: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  gota: <path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z" />,
  caixa: <><rect x="3" y="7" width="18" height="13" rx="1" /><path d="M3 7l3-4h12l3 4M8 12h8" /></>,
  silica: <><rect x="6" y="4" width="12" height="16" rx="3" /><circle cx="10" cy="10" r="1" /><circle cx="14" cy="13" r="1" /><circle cx="10" cy="15" r="1" /></>,
  tomada: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 9v3M15 9v3M10 16h4" /></>,
  antena: <><path d="M12 10v12M8 22h8" /><path d="M8.5 6.5a5 5 0 0 1 7 0M6 4a8.5 8.5 0 0 1 12 0" /><circle cx="12" cy="9" r="1.5" /></>,
  relogio: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  multimetro: <><rect x="6" y="2" width="12" height="20" rx="2" /><rect x="8.5" y="5" width="7" height="4" /><circle cx="12" cy="14" r="2.5" /></>,
  falar: <><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></>,
  casa: <path d="M4 11l8-6 8 6v9H4z" />,
  guia: <><path d="M5 4h11l3 3v13H5z" /><path d="M8 10h8M8 14h8" /></>,
  mapa: <><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  chamado: <><path d="M4 5h16v10H8l-4 4z" /><path d="M12 8v3M12 13h.01" /></>,
  barco: <><path d="M3 16h18l-3 4H6z" /><path d="M12 4v12M12 4l6 8H12" /></>,
  impacto: <><path d="M12 21c-5-3-8-7-8-11a8 8 0 0 1 16 0c0 4-3 8-8 11z" /><path d="M12 8v7M9 12h6" /></>,
  bateria: <><rect x="2" y="7" width="18" height="10" rx="2" /><path d="M22 10v4" /></>,
  seta: <path d="M9 5l7 7-7 7" />,
  sair: <><path d="M15 4h4v16h-4" /><path d="M10 8l-4 4 4 4M6 12h10" /></>,
  check: <path d="M5 12l5 5 9-10" />,
  pessoas: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5" /><circle cx="17" cy="9" r="2.5" /><path d="M16 15c3 0 5 2 5 5" /></>,
};

export function Icon({ name, size = 22, stroke = 1.8, className, label }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" className={className}
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {PATHS[name] ?? PATHS.guia}
    </svg>
  );
}
