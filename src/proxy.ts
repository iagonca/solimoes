import { auth } from "@/lib/auth/server";

// Tudo exige sessão, menos as páginas públicas (início, impacto, contato, créditos)
// e a rota do ESP32, que se autentica pelo token no cabeçalho.
// A autorização por perfil é feita em cada página e em cada ação (src/lib/session.ts).
export default auth.middleware({
  loginUrl: "/auth/sign-in",
  publicRoutes: ["/", "/impacto", "/contato", "/creditos", "/api/telemetry"],
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
