import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { sqlOne } from "@/lib/db";

export type Role = "engenheiro" | "coordenador" | "agente" | "morador";

export type Profile = {
  email: string;
  display_name: string;
  role: Role;
  community_id: number | null;
  system_id: number | null;
};

// Perfil do usuário logado (ligado à conta do Neon Auth pelo e-mail).
export async function getProfile(): Promise<Profile | null> {
  const { data: session } = await auth.getSession();
  const email = session?.user?.email;
  if (!email) return null;
  return sqlOne<Profile>(
    "select email, display_name, role, community_id, system_id from profiles where email = $1 and active",
    [email.toLowerCase()],
  );
}

export function homeFor(role: Role) {
  if (role === "agente") return "/agente";
  if (role === "morador") return "/casa";
  return "/painel";
}

// Para páginas: sem sessão vai para o login; perfil errado vai para a própria tela.
export async function requireRole(...roles: Role[]): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/auth/sign-in");
  if (!roles.includes(profile.role)) redirect(homeFor(profile.role));
  return profile;
}

// Para server actions: lança erro em vez de redirecionar.
export async function assertRole(...roles: Role[]): Promise<Profile> {
  const profile = await getProfile();
  if (!profile || !roles.includes(profile.role)) throw new Error("Não autorizado");
  return profile;
}

export const TECH_ROLES: Role[] = ["engenheiro", "coordenador"];
