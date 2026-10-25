import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { AppHeader, BigButton, Field } from "@/src/ui";

export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const [f, setF] = useState({ full_name: "", username: "", email: "", password: "", confirm: "" });
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "", form: "" }));
  };

  const submit = async () => {
    const e: Record<string, string> = {};
    if (f.full_name.trim().length < 2) e.full_name = "Informe seu nome completo";
    if (!/^[a-zA-Z0-9._-]{3,}$/.test(f.username.trim())) e.username = "Mínimo 3 caracteres, sem espaços";
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = "E-mail inválido";
    if (f.password.length < 6) e.password = "A senha precisa ter pelo menos 6 caracteres";
    if (f.password !== f.confirm) e.confirm = "As senhas não são iguais";
    if (!terms) e.terms = "É necessário aceitar os termos";
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    try {
      await register({ full_name: f.full_name.trim(), username: f.username.trim(), email: f.email.trim(), password: f.password, accept_terms: terms });
      router.replace("/perfil");
    } catch (err: any) {
      setErrors({ form: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Criar conta" onBack={() => router.replace("/")} />
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]} keyboardShouldPersistTaps="handled">
        <Field label="Nome completo" value={f.full_name} onChangeText={set("full_name")} placeholder="Ex.: Maria da Silva" error={errors.full_name} testID="register-name-input" />
        <Field label="Nome de usuário" value={f.username} onChangeText={set("username")} autoCapitalize="none" placeholder="Ex.: maria.silva" error={errors.username} testID="register-username-input" />
        <Field label="E-mail" value={f.email} onChangeText={set("email")} autoCapitalize="none" keyboardType="email-address" placeholder="seu@email.com" error={errors.email} testID="register-email-input" />
        <Field label="Senha" value={f.password} onChangeText={set("password")} secureTextEntry placeholder="Mínimo 6 caracteres" error={errors.password} testID="register-password-input" />
        <Field label="Confirmar senha" value={f.confirm} onChangeText={set("confirm")} secureTextEntry placeholder="Repita a senha" error={errors.confirm} testID="register-confirm-input" />
        <Pressable
          onPress={() => {
            setTerms(!terms);
            setErrors((e) => ({ ...e, terms: "" }));
          }}
          style={styles.terms}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: terms }}
          testID="register-terms-checkbox"
        >
          <View style={[styles.box, terms && styles.boxOn]}>{terms ? <Ionicons name="checkmark" size={22} color={colors.onSuccess} /> : null}</View>
          <Text style={styles.termsText}>
            Li e aceito os termos de uso e a política de privacidade. Os dados serão usados apenas para apoiar a comunicação.
          </Text>
        </Pressable>
        {errors.terms ? <Text style={styles.error}>{errors.terms}</Text> : null}
        {errors.form ? (
          <Text style={styles.error} testID="register-error">
            {errors.form}
          </Text>
        ) : null}
        <BigButton label="CRIAR CONTA" onPress={submit} loading={loading} testID="register-submit-button" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  terms: { flexDirection: "row", gap: 12, alignItems: "flex-start", minHeight: 48 },
  box: { width: 32, height: 32, borderRadius: radius.sm, borderWidth: 2, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  boxOn: { backgroundColor: c.success, borderColor: c.success },
  termsText: { flex: 1, fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: c.onSurfaceSecondary },
  error: { fontFamily: fonts.semibold, fontSize: 16, color: c.error },
}));
