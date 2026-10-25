import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useAuth } from "@/src/auth";
import { AppHeader, BigButton } from "@/src/ui";

export default function NotFound() {
  const { user } = useAuth();
  const router = useRouter();
  const leave = () => router.replace(user ? "/painel" : "/");
  return <View style={{ flex: 1 }}>
    <AppHeader title="Página não encontrada" onBack={leave} />
    <View style={{ padding: 24, gap: 16 }}>
      <Text>Este endereço não está disponível.</Text>
      <BigButton label={user ? "Voltar ao meu painel" : "Ir para o início"} onPress={leave} testID="not-found-leave-button" />
    </View>
  </View>;
}
