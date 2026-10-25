import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { safeReturnTo } from "@/src/navigation-policy";
import { fonts, makeStyles, spacing } from "@/src/theme";
import { useToast } from "@/src/toast";
import { AppHeader, BigButton, Field } from "@/src/ui";

export default function Login() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { login } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email.trim() || !password) return setError("Informe e-mail e senha");
    setError("");
    setLoading(true);
    try {
      const u = await login(email.trim(), password);
      toast(`Bem-vindo(a), ${u.full_name.split(" ")[0]}!`, "success");
      const destination = safeReturnTo(returnTo);
      router.replace(u.role ? (destination ?? "/painel") as any : { pathname: "/perfil", params: destination ? { returnTo: destination } : {} });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Entrar" onBack={() => router.replace("/")} />
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>Entre com a conta da rede de apoio (responsável, cuidador, professor ou terapeuta).</Text>
        <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="seu@email.com" testID="login-email-input" />
        <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry placeholder="Sua senha" testID="login-password-input" onSubmitEditing={submit} />
        {error ? (
          <Text style={styles.error} testID="login-error">
            {error}
          </Text>
        ) : null}
        <BigButton label="ENTRAR" onPress={submit} loading={loading} testID="login-submit-button" />
        <Pressable onPress={() => router.push("/recuperar")} style={styles.link} testID="login-forgot-link" accessibilityRole="link">
          <Text style={styles.linkText}>Esqueci minha senha</Text>
        </Pressable>
        <Pressable onPress={() => router.replace("/cadastro")} style={styles.link} testID="login-register-link" accessibilityRole="link">
          <Text style={styles.linkText}>Ainda não tem conta? Criar conta</Text>
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

export const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  lead: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 25, color: c.muted },
  error: { fontFamily: fonts.semibold, fontSize: 16, color: c.error },
  link: { minHeight: 48, justifyContent: "center", alignItems: "center" },
  linkText: { fontFamily: fonts.bold, fontSize: 17, color: c.brandPrimary },
}));
