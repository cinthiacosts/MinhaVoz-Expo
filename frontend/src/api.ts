import { storage } from "@/src/utils/storage";

export const API = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;
export const TOKEN_KEY = "auth_token";

let token: string | null = null;

export async function loadToken() {
  token = await storage.secureGet<string | null>(TOKEN_KEY, null);
  return token;
}

export async function saveToken(t: string | null) {
  token = t;
  if (t) await storage.secureSet(TOKEN_KEY, t);
  else await storage.secureRemove(TOKEN_KEY);
}

export function getToken() {
  return token;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      method: opts.method ?? "GET",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError("Sem conexão com a internet", 0);
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const detail =
      typeof data?.detail === "string"
        ? data.detail
        : Array.isArray(data?.detail)
          ? "Verifique os campos preenchidos."
          : "Algo deu errado. Tente novamente.";
    throw new ApiError(detail, res.status);
  }
  return data as T;
}

export const fileUrl = (path: string) => `${API}/files/${path}?token=${token ?? ""}`;

export const ttsUrl = (text: string, voice: string, speed: number) =>
  `${API}/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}&speed=${speed}&token=${token ?? ""}`;
