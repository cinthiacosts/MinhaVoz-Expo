import { useRouter } from "expo-router";
import { View } from "react-native";
import { AppHeader, Loading } from "@/src/ui";

// A slow or failed request must not remove the adult's way out.
export function PendingScreen({ destination, testID = "navigation-pending" }: { destination: string; testID?: string }) {
  const router = useRouter();
  return <View style={{ flex: 1 }} testID={testID}>
    <AppHeader title="Carregando" onBack={() => router.replace(destination as any)} />
    <Loading />
  </View>;
}
