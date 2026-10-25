import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { catColor, fonts, makeStyles, radius, tint, useTheme } from "@/src/theme";
import { Pictogram, Settings } from "@/src/types";
import { PictoVisual, tap } from "@/src/ui";

export const PICTO_EMOJI = { medio: 40, grande: 52, extra: 66 } as const;
export const TEXT_SCALE = { normal: 1, grande: 1.15, extra: 1.32 } as const;

export type Say = (text: string, ev?: { source: any; pictogram_ids?: string[]; category_keys?: string[] }) => void;

export function PictoCard({
  p,
  color,
  settings,
  width,
  onPress,
}: {
  p: Pictogram;
  color: string;
  settings: Settings;
  width: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const accent = catColor(colors, color);
  const emoji = PICTO_EMOJI[settings.pictogram_size] ?? 52;
  const ts = TEXT_SCALE[settings.text_size] ?? 1.15;
  const longest = Math.max(...p.name.split(/\s+/).map((w) => w.length));
  const fontSize = Math.min(15 * ts, (width - 16) / (longest * 0.88));
  return (
    <Animated.View entering={FadeIn.duration(220)} style={{ width }}>
      <Pressable
        onPress={() => {
          tap();
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={p.name}
        accessibilityHint={p.speech_text ? `Fala: ${p.speech_text}` : undefined}
        testID={`picto-${p.id}`}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: tint(accent), borderColor: accent, minHeight: emoji * 2.3 },
          pressed && { transform: [{ scale: 0.95 }], backgroundColor: tint(accent, "55") },
        ]}
      >
        <View style={styles.visual}>
          <PictoVisual emoji={p.emoji} imagePath={p.image_path} size={emoji} />
        </View>
        <Text style={[styles.label, { fontSize }]} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7}>
          {p.name.toLocaleUpperCase("pt-BR")}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export const useStyles = makeStyles((c) => ({
  card: {
    borderRadius: radius.md,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 4,
  },
  visual: { alignItems: "center", justifyContent: "center" },
  label: { fontFamily: fonts.extrabold, color: c.onSurface, textAlign: "center", letterSpacing: 0.3 },
}));
