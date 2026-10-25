// Explicit parents are safe after a deep link, refresh or account switch.
export const PROFILE_ROUTES = ["", "acompanhamento", "atividades", "configuracoes", "cuidado", "escolar", "frases", "historico", "indicadores", "pictograma", "prancha", "rede", "rotinas"];

export function safeReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return null;
  try {
    const url = new URL(value, "https://minhavoz.local");
    if (url.origin !== "https://minhavoz.local" || url.hash) return null;
    const parts = url.pathname.split("/");
    const valid = ["/painel", "/usuario/form"].includes(url.pathname)
      || (parts[1] === "usuario" && !!parts[2] && parts[2] !== "form" && parts.length <= 4 && PROFILE_ROUTES.includes(parts[3] ?? ""))
      || (parts[1] === "comunicacao" && !!parts[2] && parts.length === 3);
    return valid ? url.pathname + url.search : null;
  } catch { return null; }
}

export function protectedReturnTo(pathname: string, params: Record<string, unknown>): string | null {
  const query = new URLSearchParams();
  const keys = pathname === "/usuario/form" ? ["id"] : pathname.endsWith("/pictograma") ? ["pid", "cat"] : [];
  for (const key of keys) if (typeof params[key] === "string") query.set(key, params[key]);
  return safeReturnTo(pathname + (query.size ? `?${query}` : ""));
}
