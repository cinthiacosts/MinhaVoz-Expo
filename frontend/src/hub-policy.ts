import { CommUser, Role } from "@/src/types";

// Navigation follows the role on the selected profile, never the account role.
export const HUB_ORDER: Record<Role, string[]> = {
  responsavel: ["prancha", "pictograma", "frases", "rotinas", "atividades", "rede", "historico", "indicadores", "acompanhamento", "configuracoes"],
  cuidador: ["cuidado", "acompanhamento", "rede"],
  professor: ["atividades", "rotinas", "frases", "escolar", "acompanhamento", "rede"],
  terapeuta: ["indicadores", "historico", "acompanhamento", "rede"],
};

export function linkedRole(profile: Pick<CommUser, "id" | "my_role">, id: string): Role | null {
  return profile.id === id && Object.prototype.hasOwnProperty.call(HUB_ORDER, profile.my_role)
    ? profile.my_role : null;
}

export function hubKeys(profile: Pick<CommUser, "id" | "my_role">, id: string, hasSharedContent: boolean): string[] {
  const role = linkedRole(profile, id);
  if (!role) return [];
  return HUB_ORDER[role].filter((key) => role !== "cuidador" || key !== "acompanhamento" || hasSharedContent);
}

// Unknown administrative routes also fail closed for caregivers.
export function caregiverRedirect(profile: Pick<CommUser, "id" | "my_role">, id: string, route: string, hasSharedContent: boolean): string | null {
  if (!linkedRole(profile, id)) return "/painel";
  if (profile.my_role !== "cuidador") return null;
  const allowed = ["", "cuidado", "rede", ...(hasSharedContent ? ["acompanhamento"] : [])];
  return allowed.includes(route) ? null : `/usuario/${id}/cuidado`;
}

export function profileRouteRedirect(profile: Pick<CommUser, "id" | "my_role">, id: string, route: string, hasSharedContent: boolean): string | null {
  const role = linkedRole(profile, id);
  if (!role || role === "cuidador") return caregiverRedirect(profile, id, route, hasSharedContent);
  if (role === "professor" && ["historico", "indicadores"].includes(route)) return `/usuario/${id}/escolar`;
  return route === "" || HUB_ORDER[role].includes(route) ? null : `/usuario/${id}`;
}
