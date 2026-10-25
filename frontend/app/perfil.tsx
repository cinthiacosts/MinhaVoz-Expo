import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { safeReturnTo } from "@/src/navigation-policy";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import { Role } from "@/src/types";
import { BigButton, IconName } from "@/src/ui";

const ROLES: { role: Role; title: string; text: string; icon: IconName }[] = [
  { role: "responsavel", title: "SOU RESPONSÁVEL", text: "Mãe, pai ou responsável. Cadastra o usuário, personaliza a prancha e gerencia a rede de apoio.", icon: "home-outline" },
  { role: "cuidador", title: "SOU CUIDADOR", text: "Apoia a comunicação e as rotinas de cuidado autorizadas pelo Responsável.", icon: "heart-outline" },
  { role: "professor", title: "SOU PROFESSOR", text: "Cria atividades, orientações e a rotina escolar dos alunos.", icon: "school-outline" },
  { role: "terapeuta", title: "SOU TERAPEUTA", text: "Acompanha o histórico e a evolução de uso dos pacientes.", icon: "pulse-outline" },
];

export default function ProfileChoice() {
  const { user, setRole, logout } = useAuth();
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const [sel, setSel] = useState<Role | null>(user?.role ?? null);
  const [loading, setLoading] = useState(false);

  const save = async () => {
    if (!sel) return;
    setLoading(true);
    try {
      await setRole(sel);
      router.replace((safeReturnTo(returnTo) ?? "/painel") as any);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Como você utilizará o Minha Voz?
        </Text>
        <Text style={styles.lead}>A pessoa que se comunica não precisa de conta: você a cadastra e abre o Modo Comunicação para ela.</Text>
        {ROLES.map((r) => {
          const on = sel === r.role;
          return (
            <Pressable
              key={r.role}
              onPress={() => setSel(r.role)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              testID={`profile-option-${r.role}`}
              style={({ pressed }) => [styles.card, on && styles.cardOn, pressed && { transform: [{ scale: 0.98 }] }]}
            >
              <View style={[styles.icon, on && { backgroundColor: colors.brandPrimary }]}>
                <Ionicons name={r.icon} size={30} color={on ? colors.onBrandPrimary : colors.onSurface} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.cardTitle}>{r.title}</Text>
                <Text style={styles.cardText}>{r.text}</Text>
              </View>
              {on ? <Ionicons name="checkmark-circle" size={30} color={colors.success} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <BigButton label="CONTINUAR" onPress={save} disabled={!sel} loading={loading} testID="profile-continue-button" />
        {user?.role ? <BigButton label="Voltar ao meu painel" variant="outline" onPress={() => router.replace("/painel")} testID="profile-back-panel-button" />
          : <BigButton label="Sair da conta" variant="outline" onPress={async () => { await logout(); router.replace("/"); }} testID="profile-logout-button" />}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.lg },
  title: { fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 38, color: c.onSurface },
  lead: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 25, color: c.muted },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: c.border,
    backgroundColor: c.surfaceSecondary,
    minHeight: 96,
  },
  cardOn: { borderColor: c.brandPrimary },
  icon: { width: 60, height: 60, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 18, color: c.onSurface },
  cardText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: c.muted },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
}));
