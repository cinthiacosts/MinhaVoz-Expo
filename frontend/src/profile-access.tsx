import { useFocusEffect } from "expo-router";
import { createContext, useCallback, useContext, useState } from "react";
import { api, getToken } from "@/src/api";
import { useAuth } from "@/src/auth";
import { linkedRole } from "@/src/hub-policy";
import { CommUser, TherapyNote } from "@/src/types";

export type ProfileAccess = { profile: CommUser; hasSharedContent: boolean };
export const ProfileAccessContext = createContext<ProfileAccess | null>(null);

export function useProfileAccessContext() {
  const access = useContext(ProfileAccessContext);
  if (!access) throw new Error("Vínculo ainda não validado");
  return access;
}

// Revalidate on navigation/focus. Never reuse another account/profile's result,
// and discard responses arriving after a route, account or focus change.
export function useVerifiedProfile(id: string | undefined, route: string) {
  const { user } = useAuth();
  const token = getToken();
  const scope = JSON.stringify([user?.id, token, id, route]);
  const [result, setResult] = useState<{ scope: string; access: ProfileAccess | null; failed: boolean } | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    setResult(null);
    if (user && id) {
      (async () => {
        try {
          const profile = await api<CommUser>(`/comm-users/${id}`);
          if (!linkedRole(profile, id)) throw new Error("Vínculo inválido");
          let hasSharedContent = false;
          if (profile.my_role === "cuidador") {
            // The backend returns only excerpts explicitly authorized for this link.
            // Failure to check sharing must not expose a menu or block daily care.
            try { hasSharedContent = (await api<TherapyNote[]>(`/comm-users/${id}/therapy-notes`)).length > 0; }
            catch { hasSharedContent = false; }
          }
          if (active && getToken() === token) setResult({ scope, access: { profile, hasSharedContent }, failed: false });
        } catch {
          if (active && getToken() === token) setResult({ scope, access: null, failed: true });
        }
      })();
    }
    return () => { active = false; setResult(null); };
  }, [id, user?.id, token, scope]));
  return result?.scope === scope ? result : { access: null, failed: false };
}
