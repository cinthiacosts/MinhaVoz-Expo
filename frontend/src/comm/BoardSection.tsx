import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";

import { PictoCard, Say, TEXT_SCALE } from "@/src/comm/PictoCard";
import { catColor, fonts, makeStyles, radius, spacing, tint, useTheme } from "@/src/theme";
import { buildSentence, speechOf } from "@/src/tts";
import { Board, Pictogram } from "@/src/types";
import { EmptyState, PictoVisual, tap } from "@/src/ui";

const FAV = "__fav";

export function BoardSection({ board, say, speaking, bottomPad }: { board: Board; say: Say; speaking: boolean; bottomPad: number }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const s = board.settings;
  const cats = board.categories.filter((c) => !s.hidden_categories?.includes(c.key));
  const [cat, setCat] = useState<string>(cats[0]?.key ?? FAV);
  const [sentence, setSentence] = useState<Pictogram[]>([]);
  const cols = Math.min(Math.max(s.grid_columns || 3, 2), 4);
  const cardW = (Math.min(width, 900) - spacing.md * 2 - spacing.xs * (cols - 1)) / cols;
  const ts = TEXT_SCALE[s.text_size] ?? 1.15;
  const colorOf = (key: string) => board.categories.find((c) => c.key === key)?.color ?? "categoryActivities";

  const items = useMemo(
    () => (cat === FAV ? board.pictograms.filter((p) => p.favorite) : board.pictograms.filter((p) => p.category_key === cat)),
    [board.pictograms, cat],
  );
  const text = buildSentence(sentence);

  const add = (p: Pictogram) => {
    setSentence((prev) => [...prev, p].slice(-20));
    if (s.speak_on_tap) say(speechOf(p));
  };

  const speakAll = () => {
    if (!sentence.length) return;
    say(text, {
      source: "prancha",
      pictogram_ids: sentence.map((p) => p.id),
      category_keys: Array.from(new Set(sentence.map((p) => p.category_key))),
    });
  };

  const chips = [{ key: FAV, name: "Favoritos", emoji: "⭐", color: "categoryPeople" }, ...cats];

  return (
    <View style={{ flex: 1 }}>
      {/* Sentence strip */}
      <View style={styles.strip} testID="sentence-strip">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripScroll}>
          {sentence.length === 0 ? (
            <Text style={styles.placeholder}>Toque nas figuras para montar a frase</Text>
          ) : (
            sentence.map((p, i) => (
              <Animated.View key={`${p.id}-${i}`} entering={ZoomIn.duration(180)} style={[styles.mini, { borderColor: catColor(colors, colorOf(p.category_key)) }]}>
                <PictoVisual emoji={p.emoji} imagePath={p.image_path} size={26} />
                <Text style={styles.miniText} numberOfLines={1}>
                  {p.name.toLocaleUpperCase("pt-BR")}
                </Text>
              </Animated.View>
            ))
          )}
        </ScrollView>
        {sentence.length ? (
          <Text style={[styles.sentence, { fontSize: 20 * ts }]} testID="sentence-text" accessibilityLiveRegion="polite">
            {text}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              tap();
              speakAll();
            }}
            disabled={!sentence.length}
            style={({ pressed }) => [styles.speak, !sentence.length && { opacity: 0.5 }, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Falar frase"
            testID="board-speak-button"
          >
            <Ionicons name={speaking ? "volume-high" : "volume-high-outline"} size={30} color={colors.onBrandPrimary} />
            <Text style={styles.speakText}>{speaking ? "FALANDO..." : "FALAR"}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              tap();
              setSentence((p) => p.slice(0, -1));
            }}
            style={({ pressed }) => [styles.side, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Apagar último"
            testID="board-backspace-button"
          >
            <Ionicons name="backspace-outline" size={28} color={colors.onSurface} />
            <Text style={styles.sideText}>APAGAR</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              tap();
              setSentence([]);
            }}
            style={({ pressed }) => [styles.side, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Limpar frase"
            testID="board-clear-button"
          >
            <Ionicons name="trash-outline" size={26} color={colors.onSurface} />
            <Text style={styles.sideText}>LIMPAR</Text>
          </Pressable>
        </View>
      </View>

      {/* Category chips */}
      <View style={styles.chipRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
          {chips.map((c) => {
            const on = cat === c.key;
            const accent = catColor(colors, c.color);
            return (
              <Pressable
                key={c.key}
                onPress={() => {
                  tap();
                  setCat(c.key);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 2, right: 2 }}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={c.name}
                testID={`category-chip-${c.key}`}
                style={[styles.chip, { borderColor: accent, backgroundColor: on ? accent : tint(accent) }]}
              >
                <Text style={styles.chipEmoji}>{c.emoji}</Text>
                <Text style={[styles.chipText, on && { color: colors.onCategory }]}>{c.name.toLocaleUpperCase("pt-BR")}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        key={cols}
        data={items}
        numColumns={cols}
        keyExtractor={(p) => p.id}
        columnWrapperStyle={{ gap: spacing.xs }}
        contentContainerStyle={[styles.grid, { paddingBottom: bottomPad }]}
        ListEmptyComponent={
          <EmptyState emoji="🖼️" title={cat === FAV ? "Nenhum favorito ainda" : "Nenhum pictograma aqui"} text="Adicione pictogramas no editor da prancha." testID="board-empty" />
        }
        renderItem={({ item }) => <PictoCard p={item} color={colorOf(item.category_key)} settings={s} width={cardW} onPress={() => add(item)} />}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  strip: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: c.borderStrong,
    backgroundColor: c.surfaceSecondary,
    gap: 8,
  },
  stripScroll: { gap: 8, alignItems: "center", minHeight: 64 },
  placeholder: { fontFamily: fonts.medium, fontSize: 17, color: c.muted },
  mini: { alignItems: "center", justifyContent: "center", borderWidth: 2, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4, minWidth: 64, backgroundColor: c.surface },
  miniText: { fontFamily: fonts.extrabold, fontSize: 12, color: c.onSurface },
  sentence: { fontFamily: fonts.bold, color: c.onSurface },
  actions: { flexDirection: "row", gap: 8 },
  speak: {
    flex: 1,
    minHeight: 64,
    borderRadius: radius.md,
    backgroundColor: c.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  speakText: { fontFamily: fonts.extrabold, fontSize: 22, color: c.onBrandPrimary, letterSpacing: 1 },
  side: { width: 76, minHeight: 64, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center", gap: 2 },
  sideText: { fontFamily: fonts.bold, fontSize: 11, color: c.onSurface },
  pressed: { transform: [{ scale: 0.96 }] },
  chipRow: { height: 56, justifyContent: "center" },
  chipScroll: { gap: 8, paddingHorizontal: spacing.md, alignItems: "center" },
  chip: { height: 36, flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 2 },
  chipEmoji: { fontSize: 18 },
  chipText: { fontFamily: fonts.extrabold, fontSize: 13, color: c.onCategory, letterSpacing: 0.4 },
  grid: { paddingHorizontal: spacing.md, gap: spacing.xs },
}));
