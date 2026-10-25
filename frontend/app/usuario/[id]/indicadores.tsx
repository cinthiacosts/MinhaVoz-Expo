import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { flushQueue } from "@/src/offline";
import { catColor, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import { CommUser, SOURCE_LABEL } from "@/src/types";
import { AppHeader, Choice, EmptyState, Loading, PictoVisual, SectionTitle } from "@/src/ui";

type Stats = {
  total_phrases: number;
  total_sessions: number;
  total_minutes: number;
  by_source: Record<string, number>;
  daily: { date: string; count: number }[];
  top_pictograms: { id: string; name: string; emoji: string; image_path?: string; count: number }[];
  top_categories: { key: string; name: string; emoji: string; color: string; count: number }[];
  recent_sessions: { id: string; started_at: string; duration_sec: number }[];
};

function Bars({ items, color }: { items: { label: string; value: number; color?: string; lead?: React.ReactNode }[]; color: string }) {
  const styles = useStyles();
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <View style={{ gap: 10 }}>
      {items.map((i) => (
        <View key={i.label} style={styles.barRow}>
          {i.lead}
          <Text style={styles.barLabel} numberOfLines={1}>
            {i.label}
          </Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${(i.value / max) * 100}%`, backgroundColor: i.color ?? color }]} />
          </View>
          <Text style={styles.barValue}>{i.value}</Text>
        </View>
      ))}
    </View>
  );
}

export default function Indicators() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const [days, setDays] = useState(14);
  const [s, setS] = useState<Stats | null>(null);

  const load = useCallback(async () => {
    try {
      await flushQueue();
      const cu = await api<CommUser>(`/comm-users/${id}`);
      if (cu.my_role === "professor") { setS(null); router.replace(`/usuario/${id}/escolar`); return; }
      if (cu.my_role === "cuidador") { setS(null); router.replace(`/usuario/${id}/cuidado`); return; }
      setS(await api<Stats>(`/comm-users/${id}/stats?days=${days}`));
    } catch (e: any) {
      toast(e.message, "error");
    }
  }, [id, days, toast, router]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const maxDay = Math.max(1, ...(s?.daily.map((d) => d.count) ?? [1]));

  return (
    <View style={styles.root}>
      <AppHeader title="Resumo e evolução" subtitle="Uso do aplicativo" onBack={() => router.replace(`/usuario/${id}`)} />
      {!s ? (
        <Loading />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Choice
            options={[
              { value: 7, label: "7 dias" },
              { value: 14, label: "14 dias" },
              { value: 30, label: "30 dias" },
            ]}
            value={days}
            onChange={(v) => {
              setDays(v);
              setS(null);
            }}
            testID="stats-period"
          />
          <SectionTitle>Resumo</SectionTitle>
          <View style={styles.stats}>
            {[
              { k: "sessions", label: "Sessões", v: s.total_sessions, e: "📱" },
              { k: "minutes", label: "Minutos de uso", v: s.total_minutes, e: "⏱️" },
              { k: "phrases", label: "Frases faladas", v: s.total_phrases, e: "🔊" },
              { k: "avg", label: "Média por dia", v: (Math.round((s.total_phrases / days) * 10) / 10).toLocaleString("pt-BR"), e: "📈" },
            ].map((x) => (
              <View key={x.k} style={styles.stat} testID={`stat-${x.k}`}>
                <Text style={{ fontSize: 24 }}>{x.e}</Text>
                <Text style={styles.statValue}>{x.v}</Text>
                <Text style={styles.statLabel}>{x.label}</Text>
              </View>
            ))}
          </View>

          <SectionTitle>Evolução de uso</SectionTitle>
          <View style={styles.card} testID="stats-daily-chart">
            <View style={styles.chart}>
              {s.daily.map((d) => (
                <View key={d.date} style={styles.col}>
                  <View style={[styles.colBar, { height: `${(d.count / maxDay) * 100}%`, backgroundColor: d.count ? colors.brandPrimary : colors.border }]} />
                </View>
              ))}
            </View>
            <View style={styles.axis}>
              <Text style={styles.axisText}>{s.daily[0]?.date.slice(8, 10)}/{s.daily[0]?.date.slice(5, 7)}</Text>
              <Text style={styles.axisText}>frases por dia</Text>
              <Text style={styles.axisText}>hoje</Text>
            </View>
          </View>

          <SectionTitle>Pictogramas mais utilizados</SectionTitle>
          <View style={styles.card}>
            {s.top_pictograms.length ? (
              <Bars items={s.top_pictograms.map((p) => ({ label: p.name, value: p.count, lead: <PictoVisual emoji={p.emoji} imagePath={p.image_path} size={22} /> }))} color={colors.brandSecondary} />
            ) : (
              <EmptyState emoji="📊" title="Sem dados suficientes" testID="stats-top-empty" />
            )}
          </View>

          <SectionTitle>Categorias mais utilizadas</SectionTitle>
          <View style={styles.card}>
            {s.top_categories.length ? (
              <Bars items={s.top_categories.map((c) => ({ label: `${c.emoji} ${c.name}`, value: c.count, color: catColor(colors, c.color) }))} color={colors.brandSecondary} />
            ) : (
              <Text style={styles.none}>Sem dados suficientes.</Text>
            )}
          </View>

          <SectionTitle>Formas de comunicação</SectionTitle>
          <View style={styles.card}>
            {Object.keys(s.by_source).length ? (
              <Bars items={Object.entries(s.by_source).map(([k, v]) => ({ label: SOURCE_LABEL[k] || k, value: v }))} color={colors.brandSecondary} />
            ) : (
              <Text style={styles.none}>Sem dados suficientes.</Text>
            )}
          </View>

          <SectionTitle>Sessões recentes</SectionTitle>
          <View style={styles.card}>
            {s.recent_sessions.length === 0 ? <Text style={styles.none}>Nenhuma sessão no período.</Text> : null}
            {s.recent_sessions.map((x) => {
              const d = new Date(x.started_at);
              return (
                <View key={x.id} style={styles.session} testID={`session-${x.id}`}>
                  <Text style={styles.sessionDate}>
                    {d.toLocaleDateString("pt-BR")} – {d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                  <Text style={styles.sessionDur}>{x.duration_sec ? `${Math.max(1, Math.round(x.duration_sec / 60))} min` : "em andamento"}</Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.disclaimer}>Estes dados representam apenas o uso do aplicativo. Não constituem avaliação ou diagnóstico.</Text>
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.md, gap: spacing.sm },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: { width: "48%", flexGrow: 1, padding: spacing.md, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, gap: 2 },
  statValue: { fontFamily: fonts.extrabold, fontSize: 32, color: c.onSurface },
  statLabel: { fontFamily: fonts.semibold, fontSize: 14, color: c.muted },
  card: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, gap: 8 },
  chart: { height: 140, flexDirection: "row", alignItems: "flex-end", gap: 3 },
  col: { flex: 1, height: "100%", justifyContent: "flex-end" },
  colBar: { width: "100%", minHeight: 4, borderRadius: 4 },
  axis: { flexDirection: "row", justifyContent: "space-between" },
  axisText: { fontFamily: fonts.medium, fontSize: 12, color: c.muted },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barLabel: { width: 110, fontFamily: fonts.semibold, fontSize: 14, color: c.onSurface },
  barTrack: { flex: 1, height: 18, borderRadius: 9, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 9 },
  barValue: { width: 32, textAlign: "right", fontFamily: fonts.extrabold, fontSize: 15, color: c.onSurface },
  none: { fontFamily: fonts.regular, fontSize: 15, color: c.muted },
  session: { flexDirection: "row", justifyContent: "space-between", minHeight: 36, alignItems: "center" },
  sessionDate: { fontFamily: fonts.semibold, fontSize: 15, color: c.onSurface },
  sessionDur: { fontFamily: fonts.bold, fontSize: 15, color: c.brandSecondary },
  disclaimer: { fontFamily: fonts.medium, fontSize: 13, color: c.muted, marginTop: spacing.md, textAlign: "center" },
}));
