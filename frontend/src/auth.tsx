import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { api, ApiError, loadToken, saveToken } from "@/src/api";
import { Role, User } from "@/src/types";
import { storage } from "@/src/utils/storage";

const USER_KEY = "auth_user";

type AuthCtx = {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { full_name: string; username: string; email: string; password: string; accept_terms: boolean }) => Promise<User>;
  setRole: (role: Role) => Promise<User>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const persist = useCallback(async (u: User | null) => {
    setUser(u);
    if (u) await storage.setItem(USER_KEY, JSON.stringify(u));
    else await storage.removeItem(USER_KEY);
  }, []);

  useEffect(() => {
    (async () => {
      const t = await loadToken();
      if (t) {
        try {
          await persist(await api<User>("/auth/me"));
        } catch (e) {
          if (e instanceof ApiError && e.status === 0) {
            // Offline: keep the last known account so Communication Mode still opens.
            const cached = await storage.getItem<string | null>(USER_KEY, null);
            if (cached) setUser(JSON.parse(cached));
          } else {
            await saveToken(null);
            await persist(null);
          }
        }
      }
      setReady(true);
    })();
  }, [persist]);

  const login = async (email: string, password: string) => {
    const r = await api<{ token: string; user: User }>("/auth/login", { method: "POST", body: { email, password } });
    await saveToken(r.token);
    await persist(r.user);
    return r.user;
  };

  const register: AuthCtx["register"] = async (data) => {
    const r = await api<{ token: string; user: User }>("/auth/register", { method: "POST", body: data });
    await saveToken(r.token);
    await persist(r.user);
    return r.user;
  };

  const setRole = async (role: Role) => {
    const u = await api<User>("/auth/role", { method: "PUT", body: { role } });
    await persist(u);
    return u;
  };

  const logout = async () => {
    await saveToken(null);
    await persist(null);
  };

  return <Ctx.Provider value={{ user, ready, login, register, setRole, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
