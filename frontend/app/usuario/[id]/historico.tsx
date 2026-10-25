import { PendingScreen } from "@/src/navigation-ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { SectionList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { flushQueue } from "@/src/offline";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import { CommUser, SOURCE_LABEL } from "@/src/types";
import { AppHeader, ConfirmSheet, EmptyState, IconBtn } from "@/src/ui";

type Ev = { id: string; text: string; source: string; created_at: string };


const pad = (n: number) => String(n).padStart(2, "0");
const dateLabel = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

export default function History() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const [cu, setCu] = useState<CommUser | null>(null);
  const [items, setItems] = useState<Ev[] | null>(null);
  const [ask, setAsk] = useState(false);

  const load = useCallback(async () => {
    try {
      await flushQueue();
      const u = await api<CommUser>(`/comm-users/${id}`);
      if (u.my_role === "professor") { setItems([]); router.replace(`/usuario/${id}/escolar`); return; }
      if (u.my_role === "cuidador") { setItems([]); router.replace(`/usuario/${id}/cuidado`); return; }
      const h = await api<Ev[]>(`/comm-users/${id}/history?limit=300`);
      setCu(u);
      setItems(h);
    } catch (e: any) {
      toast(e.message, "error");
      setItems([]);
    }
  }, [id, toast, router]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!items) return <PendingScreen destination={`/usuario/${id}`} />;
  const groups: Record<string, Ev[]> = {};
  items.forEach((e) => {
    const k = dateLabel(new Date(e.created_at));
    (groups[k] = groups[k] || []).push(e);
  });
  const sections = Object.entries(groups).map(([title, data]) => ({ title, data }));

  return (
    <View style={styles.root}>
      <AppHeader
        title="Histórico"
        subtitle={cu?.name}
        onBack={() => router.replace(`/usuario/${id}`)}
        right={cu?.my_role === "responsavel" && items.length ? <IconBtn icon="trash-outline" color={colors.error} label="Apagar histórico" onPress={() => setAsk(true)} testID="history-clear-button" /> : null}
      />
      <SectionList
        sections={sections}
        keyExtractor={(e) => e.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.lg }]}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          cu && !cu.settings?.history_enabled ? <Text style={styles.off}>O registro de histórico está desativado nas configurações.</Text> : <Text style={styles.lead}>Registro das frases faladas, para apoiar o acompanhamento.</Text>
        }
        ListEmptyComponent={<EmptyState emoji="🕒" title="Nenhuma frase registrada" text="As frases faladas no Modo Comunicação aparecerão aqui." testID="history-empty" />}
        renderSectionHeader={({ section }) => <Text style={styles.day}>{section.title}</Text>}
        renderItem={({ item }) => {
          const d = new Date(item.created_at);
          return (
            <View style={styles.row} testID={`history-item-${item.id}`}>
              <Text style={styles.time}>
                {pad(d.getHours())}:{pad(d.getMinutes())}
              </Text>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.text}>“{item.text}”</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{SOURCE_LABEL[item.source] || item.source}</Text>
                </View>
              </View>
            </View>
          );
        }}
      />
      <ConfirmSheet
        visible={ask}
        title="Apagar todo o histórico?"
        text="Esta ação não pode ser desfeita."
        confirmLabel="Apagar"
        onClose={() => setAsk(false)}
        onConfirm={async () => {
          setAsk(false);
          try {
            await api(`/comm-users/${id}/history`, { method: "DELETE" });
            load();
          } catch (e: any) {
            toast(e.message, "error");
          }
        }}
        testID="history-clear-confirm"
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  list: { padding: spacing.md, gap: 8 },
  lead: { fontFamily: fonts.regular, fontSize: 15, color: c.muted, marginBottom: 4 },
  off: { fontFamily: fonts.semibold, fontSize: 15, color: c.onWarning, backgroundColor: c.warning, padding: 12, borderRadius: radius.md },
  day: { fontFamily: fonts.extrabold, fontSize: 16, color: c.onSurface, marginTop: spacing.md, marginBottom: 4 },
  row: { flexDirection: "row", gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  time: { fontFamily: fonts.extrabold, fontSize: 16, color: c.brandPrimary, width: 52 },
  text: { fontFamily: fonts.semibold, fontSize: 17, color: c.onSurface },
  badge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary },
  badgeText: { fontFamily: fonts.semibold, fontSize: 12, color: c.onSurfaceTertiary },
}));
