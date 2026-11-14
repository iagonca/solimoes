import type { NextConfig } from "next";

// cacheComponents desligado: as páginas leem sessão e banco a cada requisição
// e são renderizadas dinamicamente, no modelo clássico.
// Sem a regra do Tailwind do scaffold: o projeto usa CSS próprio (globals.css e CSS Modules).
const nextConfig: NextConfig = {};

export default nextConfig;
