import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fileUrl } from "@/src/api";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];

export const tap = () => {
  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};

export function AppHeader({
  title,
  subtitle,
  onBack,
  right,
  testID,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]} testID={testID}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          testID="header-back-button"
        >
          <Ionicons name="arrow-back" size={26} color={colors.brandPrimary} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.headerSub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function IconBtn({
  icon,
  onPress,
  label,
  testID,
  color,
  bg,
  size = 48,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  testID: string;
  color?: string;
  bg?: string;
  size?: number;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      hitSlop={6}
      style={({ pressed }) => [styles.iconBtn, { width: size, height: size, backgroundColor: bg ?? colors.surfaceTertiary }, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.48)} color={color ?? colors.brandPrimary} />
    </Pressable>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";

export function BigButton({
  label,
  onPress,
  icon,
  variant = "primary",
  loading,
  disabled,
  testID,
  style,
  height = 64,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: BtnVariant;
  loading?: boolean;
  disabled?: boolean;
  testID: string;
  style?: ViewStyle;
  height?: number;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const bg = {
    primary: colors.brandPrimary,
    secondary: colors.brandSecondary,
    ghost: colors.surfaceTertiary,
    danger: colors.error,
    outline: colors.surfaceSecondary,
  }[variant];
  const fg = {
    primary: colors.onBrandPrimary,
    secondary: colors.onBrandSecondary,
    ghost: colors.onSurfaceTertiary,
    danger: colors.onError,
    outline: colors.brandPrimary,
  }[variant];
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, minHeight: height },
        variant === "outline" && styles.btnOutline,
        (disabled || loading) && { opacity: 0.55 },
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={24} color={fg} /> : null}
          <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, error, testID, style, onFocus, onBlur, ...rest }: TextInputProps & { label: string; error?: string; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        testID={testID}
        style={[styles.input, focused ? { borderColor: colors.focusBorder } : null, error ? { borderColor: colors.error, outlineColor: colors.error } : null, style]}
        onFocus={(event) => { setFocused(true); onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }}
        {...rest}
      />
      {error ? (
        <Text style={styles.errorText} testID={`${testID}-error`}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export const EMOJIS = [
  "⭐", "💬", "📖", "📕", "✏️", "📝", "📚", "🎒", "🏫", "🍎", "➕", "🎨", "🏠", "🙋", "🚻", "🥤", "🪑", "👂", "⏰",
  "✅", "❓", "🆘", "🔁", "😊", "😢", "❤️", "🍽️", "💧", "🛏️", "🚿", "🧸", "⚽", "🎵", "📺", "🚗", "🌳", "👩", "👨",
  "👵", "👴", "🐶", "🐱", "🎮", "🍞", "🧃", "🏥", "🛒", "🦷", "👕", "🧩",
];

export function EmojiPicker({ value, onChange, testID }: { value?: string; onChange: (e: string) => void; testID: string }) {
  const styles = useStyles();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }} testID={testID}>
      {EMOJIS.map((e) => (
        <Pressable
          key={e}
          onPress={() => onChange(e)}
          accessibilityRole="button"
          accessibilityLabel={`Ícone ${e}`}
          testID={`${testID}-${e}`}
          style={[styles.emojiChip, value === e && styles.emojiChipOn]}
        >
          <Text style={{ fontSize: 26 }}>{e}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function Choice<T extends string | number>({
  options,
  value,
  onChange,
  testID,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  testID: string;
}) {
  const styles = useStyles();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map((o) => (
        <Pressable
          key={String(o.value)}
          onPress={() => onChange(o.value)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === o.value }}
          testID={`${testID}-${o.value}`}
          style={[styles.choice, value === o.value && styles.choiceOn]}
        >
          <Text style={[styles.choiceText, value === o.value && styles.choiceTextOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function PictoVisual({ emoji, imagePath, size }: { emoji?: string; imagePath?: string | null; size: number }) {
  if (imagePath) {
    return (
      <Image
        source={{ uri: fileUrl(imagePath) }}
        style={{ width: size * 1.35, height: size * 1.35, borderRadius: 12 }}
        contentFit="cover"
        cachePolicy="disk"
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <Text style={{ fontSize: size, lineHeight: size * 1.25 }} accessible={false}>
      {emoji || "⭐"}
    </Text>
  );
}

export function Loading({ testID = "loading-indicator" }: { testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }} testID={testID}>
      <ActivityIndicator size="large" color={colors.brandPrimary} />
    </View>
  );
}

export function EmptyState({ emoji, title, text, testID }: { emoji: string; title: string; text?: string; testID: string }) {
  const styles = useStyles();
  return (
    <View style={styles.empty} testID={testID}>
      <Text style={{ fontSize: 56 }}>{emoji}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={styles.emptyText}>{text}</Text> : null}
    </View>
  );
}

export function Sheet({
  visible,
  onClose,
  title,
  children,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  testID: string;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Fechar" testID={`${testID}-backdrop`} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]} testID={testID}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <IconBtn icon="close" onPress={onClose} label="Fechar" testID={`${testID}-close`} />
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function ConfirmSheet({
  visible,
  title,
  text,
  confirmLabel,
  onConfirm,
  onClose,
  testID,
}: {
  visible: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  testID: string;
}) {
  const styles = useStyles();
  return (
    <Sheet visible={visible} onClose={onClose} title={title} testID={testID}>
      <Text style={styles.body}>{text}</Text>
      <View style={{ gap: 12, marginTop: spacing.lg }}>
        <BigButton label={confirmLabel} variant="danger" onPress={onConfirm} testID={`${testID}-confirm`} />
        <BigButton label="Cancelar" variant="ghost" onPress={onClose} testID={`${testID}-cancel`} />
      </View>
    </Sheet>
  );
}

export function PermissionBlocked({ text, testID }: { text: string; testID: string }) {
  const styles = useStyles();
  return (
    <View style={styles.permBox} testID={testID}>
      <Text style={styles.body}>{text}</Text>
      <BigButton label="Abrir configurações" icon="settings-outline" variant="outline" onPress={() => Linking.openSettings()} testID={`${testID}-open-settings`} />
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  const styles = useStyles();
  return (
    <Text style={styles.section} accessibilityRole="header">
      {children}
    </Text>
  );
}

export const useStyles = makeStyles((c) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  headerBtn: { width: 48, height: 48, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary },
  headerTitle: { fontFamily: fonts.extrabold, fontSize: 24, color: c.onSurface },
  headerSub: { fontFamily: fonts.medium, fontSize: 15, color: c.muted },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  iconBtn: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  btn: {
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: spacing.lg,
  },
  btnOutline: { borderWidth: 2, borderColor: c.brandPrimary },
  btnText: { fontFamily: fonts.bold, fontSize: 19, letterSpacing: 0.3 },
  label: { fontFamily: fonts.bold, fontSize: 16, color: c.onSurface },
  input: {
    minHeight: 56,
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    borderRadius: radius.md,
    outlineColor: c.focusBorder,
    backgroundColor: c.surfaceSecondary,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.medium,
    fontSize: 18,
    color: c.onSurface,
  },
  errorText: { color: c.error, fontFamily: fonts.semibold, fontSize: 14 },
  emojiChip: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: c.border,
    flexShrink: 0,
  },
  emojiChipOn: { borderColor: c.brandPrimary, backgroundColor: c.surfaceTertiary },
  choice: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    backgroundColor: c.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  choiceOn: { backgroundColor: c.selected, borderColor: c.selected },
  choiceText: { fontFamily: fonts.semibold, fontSize: 16, color: c.onSurface },
  choiceTextOn: { color: c.onSelected },
  empty: { alignItems: "center", padding: spacing.xl, gap: 8 },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 20, color: c.onSurface, textAlign: "center" },
  emptyText: { fontFamily: fonts.regular, fontSize: 16, color: c.muted, textAlign: "center", lineHeight: 23 },
  sheetBackdrop: { flex: 1, backgroundColor: c.overlay },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: "92%",
  },
  sheetHandle: { alignSelf: "center", width: 48, height: 5, borderRadius: 3, backgroundColor: c.borderStrong, marginBottom: spacing.sm },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  sheetTitle: { fontFamily: fonts.extrabold, fontSize: 22, color: c.onSurface, flex: 1 },
  body: { fontFamily: fonts.regular, fontSize: 17, color: c.onSurfaceSecondary, lineHeight: 25 },
  permBox: { gap: 12, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  section: { fontFamily: fonts.extrabold, fontSize: 15, color: c.muted, letterSpacing: 1, textTransform: "uppercase", marginTop: spacing.md },
}));
