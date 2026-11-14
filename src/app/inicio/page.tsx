import { redirect } from "next/navigation";
import { getProfile, homeFor } from "@/lib/session";

// Depois do login, cada perfil vai para a sua tela.
export default async function Inicio() {
  const profile = await getProfile();
  if (!profile) redirect("/auth/sign-in?semperfil=1");
  redirect(homeFor(profile.role));
}

export const dynamic = "force-dynamic";
