import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { hubKeys } from "@/src/hub-policy";
import { useProfileAccessContext } from "@/src/profile-access";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { ROLE_LABEL, Role } from "@/src/types";
import { AppHeader, BigButton, IconName, PictoVisual } from "@/src/ui";

type Item = { key: string; label: string; desc: string; icon: IconName; path: string; roles: Role[] };

const ALL: Role[] = ["responsavel", "cuidador", "professor", "terapeuta"];
const ITEMS: Item[] = [
  { key: "cuidado", label: "Apoio ao cuidado", desc: "Executar rotinas de casa e consultar orientações para a pessoa", icon: "heart-outline", path: "cuidado", roles: ["cuidador"] },
  { key: "escolar", label: "Uso escolar", desc: "Suas comunicações escolares e status das atividades", icon: "school-outline", path: "escolar", roles: ["professor"] },
  { key: "acompanhamento", label: "Acompanhamento compartilhado", desc: "Registros privados do terapeuta e trechos autorizados", icon: "document-text-outline", path: "acompanhamento", roles: ALL },
  { key: "atividades", label: "Atividades", desc: "Orientações que aparecem na área Escola", icon: "book-outline", path: "atividades", roles: ["professor", "responsavel"] },
  { key: "rotinas", label: "Rotina visual", desc: "Sequência de etapas do dia ou da aula", icon: "list-outline", path: "rotinas", roles: ["responsavel", "professor"] },
  { key: "prancha", label: "Editar prancha", desc: "Pictogramas, categorias e favoritos", icon: "grid-outline", path: "prancha", roles: ["responsavel"] },
  { key: "pictograma", label: "Adicionar pictograma", desc: "Com foto da galeria e texto falado", icon: "add-circle-outline", path: "pictograma", roles: ["responsavel"] },
  { key: "frases", label: "Frases rápidas", desc: "Frases faladas com um toque", icon: "chatbox-ellipses-outline", path: "frases", roles: ["responsavel", "professor"] },
  { key: "indicadores", label: "Resumo e evolução de uso", desc: "Sessões, gráficos e mais utilizados", icon: "stats-chart-outline", path: "indicadores", roles: ALL.filter((role) => role !== "cuidador") },
  { key: "historico", label: "Histórico", desc: "Frases faladas com data e hora", icon: "time-outline", path: "historico", roles: ALL.filter((role) => role !== "cuidador") },
  { key: "rede", label: "Rede de apoio", desc: "Responsáveis, cuidadores, professores e terapeutas", icon: "people-outline", path: "rede", roles: ALL },
  { key: "configuracoes", label: "Configurações", desc: "Tamanhos, voz, categorias e privacidade", icon: "settings-outline", path: "configuracoes", roles: ["responsavel"] },
];

function age(birth?: string | null) {
  const m = birth?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  const diff = new Date(Date.now() - d.getTime()).getUTCFullYear() - 1970;
  return diff >= 0 && diff < 130 ? diff : null;
}

export default function CommUserHub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const { profile: cu, hasSharedContent } = useProfileAccessContext();
  const role = cu.my_role;
  const items = hubKeys(cu, id, hasSharedContent).map((k) => ITEMS.find((i) => i.key === k)!).filter((i) => i.roles.includes(role));
  const a = age(cu.birth_date);

  return (
    <View style={styles.root}>
      <AppHeader
        testID="hub-header"
        title={cu.name}
        subtitle={`Você: ${ROLE_LABEL[role]}`}
        onBack={() => router.replace("/painel")}
        right={
          role === "responsavel" ? (
            <Pressable onPress={() => router.push(`/usuario/form?id=${id}`)} style={styles.edit} testID="hub-edit-user-button" accessibilityRole="button" accessibilityLabel="Editar dados do usuário">
              <Ionicons name="create-outline" size={24} color={colors.onSurface} />
            </Pressable>
          ) : null
        }
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.hero} testID="hub-hero">
          <View style={styles.avatar}>
            {cu.photo_path ? <PictoVisual imagePath={cu.photo_path} size={46} /> : <Text style={styles.avatarText}>{cu.name.charAt(0).toUpperCase()}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>{cu.name}</Text>
            <Text style={styles.heroMeta}>{a !== null ? `${a} anos` : "Usuário da comunicação"}</Text>
            {cu.preferences ? <Text style={styles.heroPref} numberOfLines={2}>{cu.preferences}</Text> : null}
          </View>
        </View>
        <BigButton label="ABRIR MODO COMUNICAÇÃO" icon="chatbubbles" height={76} onPress={() => router.push(`/comunicacao/${id}`)} testID="hub-open-comm-button" />
        {role === "terapeuta" ? (
          <Text style={styles.note}>Os dados mostram o uso do aplicativo e servem como apoio ao acompanhamento — não são avaliação ou diagnóstico.</Text>
        ) : null}
        <View style={styles.grid}>
          {items.map((it) => (
            <Pressable
              key={it.key}
              onPress={() => router.push(`/usuario/${id}/${it.path}` as any)}
              style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.98 }] }]}
              accessibilityRole="button"
              accessibilityLabel={["professor", "cuidador"].includes(role) && it.key === "rede" ? "Meu vínculo" : it.label}
              testID={`hub-item-${it.key}`}
            >
              <View style={styles.tileIcon}>
                <Ionicons name={it.icon} size={28} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tileLabel}>{["professor", "cuidador"].includes(role) && it.key === "rede" ? "Meu vínculo" : role === "professor" && it.key === "rotinas" ? "Rotinas escolares" : role === "professor" && it.key === "frases" ? "Minhas frases escolares" : it.label}</Text>
                <Text style={styles.tileDesc}>{["professor", "cuidador"].includes(role) && it.key === "rede" ? "Somente sua permissão neste perfil" : ["professor", "cuidador"].includes(role) && it.key === "acompanhamento" ? `Somente trechos autorizados ao papel ${ROLE_LABEL[role]}` : it.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.md, gap: spacing.md },
  edit: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  hero: { flexDirection: "row", gap: 14, alignItems: "center", padding: spacing.md, borderRadius: radius.lg, backgroundColor: c.surfaceTertiary },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarText: { fontFamily: fonts.extrabold, fontSize: 30, color: c.onBrandTertiary },
  heroName: { fontFamily: fonts.extrabold, fontSize: 24, color: c.onSurface },
  heroMeta: { fontFamily: fonts.semibold, fontSize: 15, color: c.muted },
  heroPref: { fontFamily: fonts.regular, fontSize: 14, color: c.onSurfaceTertiary, marginTop: 2 },
  note: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: c.muted },
  grid: { gap: 10 },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 76,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
  },
  tileIcon: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  tileLabel: { fontFamily: fonts.bold, fontSize: 18, color: c.onSurface },
  tileDesc: { fontFamily: fonts.regular, fontSize: 14, color: c.muted },
}));
