import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Redirect, Stack, useGlobalSearchParams, usePathname, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LogBox, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "@/src/auth";
import { Loading } from "@/src/ui";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { useTheme } from "@/src/theme";
import { ToastProvider } from "@/src/toast";
import { protectedReturnTo } from "@/src/navigation-policy";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

export default function RootLayout() {
  const [loaded, error] = useFonts({
    "Jakarta-Regular": require("../assets/fonts/PlusJakartaSans-Regular.ttf"),
    "Jakarta-Medium": require("../assets/fonts/PlusJakartaSans-Medium.ttf"),
    "Jakarta-SemiBold": require("../assets/fonts/PlusJakartaSans-SemiBold.ttf"),
    "Jakarta-Bold": require("../assets/fonts/PlusJakartaSans-Bold.ttf"),
    "Jakarta-ExtraBold": require("../assets/fonts/PlusJakartaSans-ExtraBold.ttf"),
  });
  if (!loaded && !error) return null;

  // One app level ErrorBoundary; a render crash shows a reload screen
  // instead of a blank app. GestureHandlerRootView must wrap the whole tree
  // or any gesture/swipe/drawer screen crashes in Expo Go.
  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <SafeAreaProvider>
            <KeyboardProvider>
              <AuthProvider>
                <ToastProvider>
                  <StatusBar style="dark" />
                  <AppStack />
                </ToastProvider>
              </AuthProvider>
            </KeyboardProvider>
          </SafeAreaProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const PUBLIC = ["", "index", "login", "cadastro", "recuperar", "+not-found"];

function AppStack() {
  const { colors } = useTheme();
  const { user, ready } = useAuth();
  const segments = useSegments() as string[];
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  if (!ready) return <Loading testID="auth-loading" />;
  if (!user && !PUBLIC.includes(segments[0] ?? "")) {
    const returnTo = protectedReturnTo(pathname, params);
    return <Redirect href={returnTo ? { pathname: "/login", params: { returnTo } } : "/login"} />;
  }
  return (
    <Stack key={user?.id ?? "anonymous"} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
      <Stack.Screen name="comunicacao/[id]" options={{ gestureEnabled: false, animation: "fade" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
