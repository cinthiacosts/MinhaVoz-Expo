import { Navigator, Redirect, Slot, useLocalSearchParams, usePathname, useSegments } from "expo-router";
import { profileRouteRedirect } from "@/src/hub-policy";
import { ProfileAccessContext, useVerifiedProfile } from "@/src/profile-access";
import { PendingScreen } from "@/src/navigation-ui";

export default function ProfileLayout() {
  // Keep the navigator mounted while validating its content. Recreating a Slot
  // navigator on every route check can reset an allowed navigation to index.
  return <Navigator><VerifiedProfileContent /></Navigator>;
}

function VerifiedProfileContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pathname = usePathname();
  const segments = useSegments() as string[];
  const route = segments[2] === "index" ? "" : segments.slice(2).join("/");
  const { access, failed } = useVerifiedProfile(id, pathname);
  if (failed) return <Redirect href="/painel" />;
  if (!access) return <PendingScreen destination={route ? `/usuario/${id}` : "/painel"} testID="profile-access-loading" />;
  const redirect = profileRouteRedirect(access.profile, id, route, access.hasSharedContent);
  if (redirect) return <Redirect href={redirect as any} />;
  return <ProfileAccessContext.Provider value={access}>
    <Slot />
  </ProfileAccessContext.Provider>;
}
