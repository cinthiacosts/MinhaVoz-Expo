import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { Say, TEXT_SCALE } from "@/src/comm/PictoCard";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Board } from "@/src/types";
import { tap } from "@/src/ui";

export function WriteSection({ board, say, speaking, bottomPad }: { board: Board; say: Say; speaking: boolean; bottomPad: number }) {
  const [text, setText] = useState("");
  const { colors } = useTheme();
  const styles = useStyles();
  const ts = TEXT_SCALE[board.settings.text_size] ?? 1.15;

  return (
    <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]} keyboardShouldPersistTaps="handled">
      <Text style={styles.title} accessibilityRole="header">
        ESCREVER E FALAR
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Digite o que você quer falar..."
        placeholderTextColor={colors.muted}
        multiline
        style={[styles.input, { fontSize: 24 * ts, lineHeight: 32 * ts }]}
        accessibilityLabel="Caixa de texto para falar"
        testID="write-text-input"
      />
      <Pressable
        onPress={() => {
          tap();
          say(text, { source: "texto" });
        }}
        disabled={!text.trim()}
        style={({ pressed }) => [styles.speak, !text.trim() && { opacity: 0.5 }, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Falar texto"
        testID="write-speak-button"
      >
        <Ionicons name="volume-high" size={32} color={colors.onBrandPrimary} />
        <Text style={styles.speakText}>{speaking ? "FALANDO..." : "FALAR"}</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          tap();
          setText("");
        }}
        style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Limpar texto"
        testID="write-clear-button"
      >
        <Ionicons name="trash-outline" size={26} color={colors.onSurface} />
        <Text style={styles.clearText}>LIMPAR</Text>
      </Pressable>
    </KeyboardAwareScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.md, gap: spacing.md },
  title: { fontFamily: fonts.extrabold, fontSize: 22, color: c.onSurface, letterSpacing: 0.5 },
  input: {
    minHeight: 220,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: c.borderStrong,
    backgroundColor: c.surfaceSecondary,
    padding: spacing.md,
    fontFamily: fonts.semibold,
    color: c.onSurface,
    textAlignVertical: "top",
  },
  speak: { minHeight: 80, borderRadius: radius.lg, backgroundColor: c.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  speakText: { fontFamily: fonts.extrabold, fontSize: 26, color: c.onBrandPrimary, letterSpacing: 1 },
  clear: { minHeight: 64, borderRadius: radius.lg, backgroundColor: c.surfaceTertiary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  clearText: { fontFamily: fonts.extrabold, fontSize: 20, color: c.onSurface },
  pressed: { transform: [{ scale: 0.97 }] },
}));
