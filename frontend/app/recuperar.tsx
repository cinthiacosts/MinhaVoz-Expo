import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { fonts, makeStyles, radius, spacing } from "@/src/theme";
import { useToast } from "@/src/toast";
import { AppHeader, BigButton, Field } from "@/src/ui";

export default function Recover() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const requestCode = async () => {
    setError("");
    setLoading(true);
    try {
      await api("/auth/forgot", { method: "POST", body: { email: email.trim() } });
      setStep(2);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = async () => {
    setError("");
    setLoading(true);
    try {
      await api("/auth/reset", { method: "POST", body: { email: email.trim(), code: code.trim(), new_password: pw } });
      toast("Senha alterada! Entre com a nova senha.", "success");
      router.replace("/login");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Recuperar senha" onBack={() => router.replace("/login")} />
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]} keyboardShouldPersistTaps="handled">
        {step === 1 ? (
          <>
            <Text style={styles.lead}>Informe o e-mail da sua conta. Enviaremos um código de recuperação.</Text>
            <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="seu@email.com" testID="recover-email-input" />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <BigButton label="ENVIAR CÓDIGO" onPress={requestCode} loading={loading} disabled={!email.trim()} testID="recover-request-button" />
          </>
        ) : (
          <>
            <Text style={styles.lead} testID="recover-sent-message">
              Se o e-mail estiver cadastrado, enviamos um código de 6 dígitos para {email.trim()}. Ele vale por 15 minutos.
            </Text>
            <Field label="Código" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="000000" testID="recover-code-input" />
            <Field label="Nova senha" value={pw} onChangeText={setPw} secureTextEntry placeholder="Mínimo 6 caracteres" testID="recover-password-input" />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <BigButton label="ALTERAR SENHA" onPress={reset} loading={loading} disabled={code.length < 6 || pw.length < 6} testID="recover-reset-button" />
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  lead: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 25, color: c.muted },
  error: { fontFamily: fonts.semibold, fontSize: 16, color: c.error },
}));
