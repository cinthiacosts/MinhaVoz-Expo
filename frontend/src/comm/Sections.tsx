import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";

import { PictoCard, Say, TEXT_SCALE } from "@/src/comm/PictoCard";
import { api } from "@/src/api";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { speechOf } from "@/src/tts";
import { Activity, Board, Phrase, Routine } from "@/src/types";
import { useToast } from "@/src/toast";
import { EmptyState, PictoVisual, tap } from "@/src/ui";

function PhraseRow({ ph, onPress, scale }: { ph: Phrase; onPress: () => void; scale: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.phrase, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Falar: ${ph.text}`}
      testID={`phrase-${ph.id}`}
    >
      <Text style={{ fontSize: 34 }}>{ph.emoji || "💬"}</Text>
      <Text style={[styles.phraseText, { fontSize: 20 * scale }]}>{ph.text}</Text>
      <Ionicons name="volume-high-outline" size={26} color={colors.brandPrimary} />
    </Pressable>
  );
}

export function PhrasesSection({ board, say, bottomPad }: { board: Board; say: Say; bottomPad: number }) {
  const styles = useStyles();
  const ts = TEXT_SCALE[board.settings.text_size] ?? 1.15;
  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}>
      <Text style={styles.title} accessibilityRole="header">
        FRASES RÁPIDAS
      </Text>
      {board.quick_phrases.length === 0 ? <EmptyState emoji="💬" title="Nenhuma frase rápida" testID="phrases-empty" /> : null}
      {board.quick_phrases.map((ph) => (
        <PhraseRow key={ph.id} ph={ph} scale={ts} onPress={() => say(ph.text, { source: "frase_rapida" })} />
      ))}
    </ScrollView>
  );
}

export function SchoolSection({ board, say, bottomPad }: { board: Board; say: Say; bottomPad: number }) {
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const toast = useToast();
  const [states, setStates] = useState<Record<string, string>>({});
  const complete = async (activity: Activity) => {
    try {
      const r = await api<Activity>(`/activities/${activity.id}/status`, { method: "PUT", body: { status: "realizada" } });
      setStates((prev) => ({ ...prev, [activity.id]: r.status ?? "realizada" }));
    } catch (e: any) { toast(e.message, "error"); }
  };
  const school = board.pictograms.filter((p) => p.category_key === "escola");
  const color = board.categories.find((c) => c.key === "escola")?.color ?? "categorySchool";
  const cols = 3;
  const cardW = (Math.min(width, 900) - spacing.md * 2 - spacing.xs * (cols - 1)) / cols;
  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}>
      {board.activities.length ? (
        <>
          <Text style={styles.title} accessibilityRole="header">
            ORIENTAÇÕES
          </Text>
          {board.activities.map((a) => (
            <View key={a.id} style={{ gap: 4 }}>
            <Pressable
              onPress={() => {
                tap();
                say(a.instruction, { source: "atividade" });
              }}
              style={({ pressed }) => [styles.activity, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`${a.title}: ${a.instruction}`}
              testID={`school-activity-${a.id}`}
            >
              <View style={styles.actVisual}>
                <PictoVisual emoji={a.emoji} imagePath={a.image_path} size={48} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.actTitle}>{a.title}</Text>
                <Text style={styles.actText}>{(a.display_text || a.instruction).toLocaleUpperCase("pt-BR")}</Text>
              </View>
            </Pressable>
            {a.kind !== "aviso" && <Pressable onPress={() => complete(a)} accessibilityRole="button" testID={`school-complete-${a.id}`} style={styles.reset}>
              <Text style={styles.resetText}>{(states[a.id] ?? a.status) === "realizada" ? "✅ Realizada" : "Marcar como realizada"}</Text>
            </Pressable>}
            </View>
          ))}
        </>
      ) : null}
      <Text style={styles.title} accessibilityRole="header">
        NA SALA DE AULA
      </Text>
      <View style={styles.wrap}>
        {school.map((p) => (
          <PictoCard key={p.id} p={p} color={color} settings={board.settings} width={cardW} onPress={() => say(speechOf(p), { source: "escola", pictogram_ids: [p.id], category_keys: ["escola"] })} />
        ))}
      </View>
    </ScrollView>
  );
}

export function FavoritesSection({ board, say, bottomPad }: { board: Board; say: Say; bottomPad: number }) {
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const ts = TEXT_SCALE[board.settings.text_size] ?? 1.15;
  const picts = board.pictograms.filter((p) => p.favorite);
  const phrases = board.quick_phrases.filter((p) => p.favorite);
  const cols = Math.min(Math.max(board.settings.grid_columns || 3, 2), 4);
  const cardW = (Math.min(width, 900) - spacing.md * 2 - spacing.xs * (cols - 1)) / cols;
  const colorOf = (key: string) => board.categories.find((c) => c.key === key)?.color ?? "categoryActivities";
  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}>
      <Text style={styles.title} accessibilityRole="header">
        ⭐ FAVORITOS
      </Text>
      {!picts.length && !phrases.length ? <EmptyState emoji="⭐" title="Nenhum favorito ainda" text="O responsável pode marcar favoritos no editor." testID="favorites-empty" /> : null}
      <View style={styles.wrap}>
        {picts.map((p) => (
          <PictoCard
            key={p.id}
            p={p}
            color={colorOf(p.category_key)}
            settings={board.settings}
            width={cardW}
            onPress={() => say(speechOf(p), { source: "prancha", pictogram_ids: [p.id], category_keys: [p.category_key] })}
          />
        ))}
      </View>
      {phrases.map((ph) => (
        <PhraseRow key={ph.id} ph={ph} scale={ts} onPress={() => say(ph.text, { source: "frase_rapida" })} />
      ))}
    </ScrollView>
  );
}

export function RoutineSection({ board, say, bottomPad, onChange }: { board: Board; say: Say; bottomPad: number; onChange: (r: Routine) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [sel, setSel] = useState(board.routines[0]?.id);
  const r = board.routines.find((x) => x.id === sel) ?? board.routines[0];
  if (!r) return <EmptyState emoji="🗓️" title="Nenhuma rotina para hoje" text="A rede de apoio pode montar uma rotina visual." testID="routine-empty" />;
  const nextIdx = r.steps.findIndex((s) => !s.done);

  const toggle = (sid: string, label: string, wasDone: boolean) => {
    const updated = { ...r, steps: r.steps.map((s) => (s.id === sid ? { ...s, done: !s.done } : s)) };
    onChange(updated);
    if (!wasDone) say(label);
    api(`/routines/${r.id}/steps/${sid}/toggle`, { method: "POST" }).catch(() => {});
  };
  const reset = () => {
    onChange({ ...r, steps: r.steps.map((s) => ({ ...s, done: false })) });
    api(`/routines/${r.id}/reset`, { method: "POST" }).catch(() => {});
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}>
      {board.routines.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {board.routines.map((x) => (
            <Pressable key={x.id} onPress={() => setSel(x.id)} style={[styles.rChip, x.id === r.id && styles.rChipOn]} testID={`routine-chip-${x.id}`} accessibilityRole="tab">
              <Text style={[styles.rChipText, x.id === r.id && { color: colors.onSurfaceInverse }]}>{x.title}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <Text style={styles.title} accessibilityRole="header">
        {r.title.toLocaleUpperCase("pt-BR")}
      </Text>
      {r.steps.map((s, i) => (
        <Pressable
          key={s.id}
          onPress={() => {
            tap();
            toggle(s.id!, s.label, s.done);
          }}
          style={({ pressed }) => [styles.step, s.done && { opacity: 0.55 }, i === nextIdx && styles.stepNext, pressed && styles.pressed]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: s.done }}
          accessibilityLabel={`Etapa ${i + 1}: ${s.label}`}
          testID={`routine-step-${s.id}`}
        >
          <View style={[styles.check, s.done && { backgroundColor: colors.success, borderColor: colors.success }]}>
            {s.done ? <Ionicons name="checkmark" size={30} color={colors.onSuccess} /> : <Text style={styles.num}>{i + 1}</Text>}
          </View>
          <Text style={{ fontSize: 40 }}>{s.emoji}</Text>
          <Text style={[styles.stepText, s.done && { textDecorationLine: "line-through" }]}>{s.label}</Text>
          {i === nextIdx ? <Text style={styles.now}>AGORA</Text> : null}
        </Pressable>
      ))}
      <Pressable onPress={reset} style={styles.reset} testID="routine-reset-button" accessibilityRole="button">
        <Ionicons name="refresh" size={22} color={colors.onSurface} />
        <Text style={styles.resetText}>Recomeçar rotina</Text>
      </Pressable>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.md, gap: spacing.sm },
  title: { fontFamily: fonts.extrabold, fontSize: 20, color: c.onSurface, letterSpacing: 0.5, marginTop: 4 },
  phrase: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 76,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: c.border,
    backgroundColor: c.surfaceSecondary,
  },
  phraseText: { flex: 1, fontFamily: fonts.bold, color: c.onSurface },
  pressed: { transform: [{ scale: 0.97 }] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  activity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 2,
    borderColor: c.categorySchool,
    minHeight: 96,
  },
  actVisual: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  actTitle: { fontFamily: fonts.semibold, fontSize: 14, color: c.muted },
  actText: { fontFamily: fonts.extrabold, fontSize: 20, lineHeight: 26, color: c.onSurface },
  rChip: { height: 44, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 2, borderColor: c.borderStrong, justifyContent: "center", flexShrink: 0, backgroundColor: c.surfaceSecondary },
  rChipOn: { backgroundColor: c.surfaceInverse, borderColor: c.surfaceInverse },
  rChipText: { fontFamily: fonts.bold, fontSize: 15, color: c.onSurface },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 84,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: c.border,
    backgroundColor: c.surfaceSecondary,
  },
  stepNext: { borderColor: c.brandPrimary, borderWidth: 3 },
  check: { width: 52, height: 52, borderRadius: 26, borderWidth: 3, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  num: { fontFamily: fonts.extrabold, fontSize: 20, color: c.onSurface },
  stepText: { flex: 1, fontFamily: fonts.bold, fontSize: 20, color: c.onSurface },
  now: { fontFamily: fonts.extrabold, fontSize: 12, color: c.brandPrimary },
  reset: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", minHeight: 56, marginTop: 8 },
  resetText: { fontFamily: fonts.bold, fontSize: 16, color: c.onSurface },
}));
