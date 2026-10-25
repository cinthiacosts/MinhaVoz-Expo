// Design tokens for this app. Light theme only.Always modify the colors and theme to Dark, Light or Dark and Light according to the design guidelines.
//
// The keys match the "color" block of /app/design_guidelines.json. Fill the
// values from that file (or from the user's brand colors). Keep every key; do
// not add a second theme or colors file; do not write color literals in
// components.
//
// How the names work: a plain key is a background, and its `on` partner is the
// text or icon color that sits on top of it. Always use them as a pair.
//   <View style={{ backgroundColor: colors.brandPrimary }}>
//     <Text style={{ color: colors.onBrandPrimary }}>Continue</Text>
//   </View>
//
// Styling a screen or component: build the sheet with makeStyles so colors
// and layout live together and follow the active scheme:
//   const useStyles = makeStyles((colors) => ({
//     card: { backgroundColor: colors.surfaceSecondary, padding: 16 },
//     title: { color: colors.onSurfaceSecondary, fontSize: 16 },
//   }));
//   function Screen() {
//     const styles = useStyles();
//     return <View style={styles.card}><Text style={styles.title}>Hi</Text></View>;
//   }
// For color props that are not styles (icon color, placeholderTextColor,
// ActivityIndicator) read useTheme().colors inside the component.
// Never call StyleSheet.create with color values at module level; it cannot
// follow the scheme.
//
// To support dark mode later: add `dark` to `themes` with every key filled.
// Nothing else changes; the device setting takes over automatically.
// Feel free to add as many new colors as you need to support the design guidelines.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";
import type { ViewStyle, TextStyle, ImageStyle } from "react-native";

export type ColorScheme = "light" | "dark";

// Approved institutional identity. CAA and status colors remain independent.
export const brandPalette = {
  white: "#FFFFFF", ink: "#101D4B", body: "#485773", border: "#EBEDF6",
  purple: "#702DC5", blue: "#12689C", outline: "#9D79DF",
  magenta: "#A02AE6", violet: "#4651DC", cyan: "#087F9D", shadow: "#3C4296",
  offWhite: "#FAFAFF", strongBorder: "#7B83A0",
  pinkCard: "#FFF0F6", pink: "#A32B69", pinkIcon: "#FBE0ED",
  greenCard: "#EDF8F2", green: "#19754E", greenIcon: "#D6F0E2",
  blueCard: "#EDF5FF", school: "#2164AB", blueIcon: "#DBEAFF",
  purpleCard: "#F3EFFF", therapist: "#7542BB", purpleIcon: "#E7DDFB",
};
export const brandGradient = [brandPalette.magenta, brandPalette.violet, brandPalette.cyan] as const;

const light = {
  surface: brandPalette.offWhite,
  onSurface: brandPalette.ink,
  surfaceSecondary: brandPalette.white,
  onSurfaceSecondary: brandPalette.ink,
  surfaceTertiary: brandPalette.purpleCard,
  onSurfaceTertiary: brandPalette.ink,
  surfaceInverse: brandPalette.ink,
  onSurfaceInverse: brandPalette.white,
  muted: brandPalette.body,

  brand: brandPalette.magenta,
  onBrand: brandPalette.white,
  brandPrimary: brandPalette.purple,
  onBrandPrimary: brandPalette.white,
  brandSecondary: brandPalette.blue,
  onBrandSecondary: brandPalette.white,
  brandTertiary: brandPalette.purpleCard,
  onBrandTertiary: brandPalette.ink,
  focusBorder: brandPalette.purple,
  selected: brandPalette.purple,
  onSelected: brandPalette.white,
  favorite: "#F4C044",
  // Foreground for the unchanged, saturated CAA category backgrounds.
  onCategory: "#070E26",

  success: "#3F6E4D",
  onSuccess: "#FFFFFF",
  warning: "#F4C044",
  onWarning: "#1A1A1A",
  error: "#C2413C",
  onError: "#FFFFFF",
  info: brandPalette.school,
  onInfo: "#FFFFFF",

  border: brandPalette.border,
  borderStrong: brandPalette.strongBorder,
  divider: brandPalette.border,

  // Fitzgerald-key inspired category accents
  categoryPeople: "#F4C044",
  categoryActions: "#65966B",
  categoryNouns: "#E06D53",
  categoryFeelings: "#C96480",
  categoryPlaces: "#F28F79",
  categoryNeeds: "#D9534F",
  categoryActivities: "#D98E32",
  categorySchool: "#3F8A8C",
  overlay: "rgba(26,26,26,0.55)",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

// In-app theme toggle, only after `dark` exists in `themes`. Call
// setColorScheme("dark"), setColorScheme("light"), or setColorScheme(null) to
// follow the device. Every useTheme() consumer re-renders. Persisting the
// choice and re-applying it on launch is the toggle's job.
export function setColorScheme(scheme: ColorScheme | null) {
  // RN 0.86 re-reads the device scheme only for the literal "unspecified";
  // null would pin useColorScheme() to null and the app to light.
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

// Keep native surfaces (alerts, pickers, navigation chrome) on the schemes this
// app ships: light only forces light; once `dark` exists the device decides.
// Optional call because react-native-web does not implement it.
setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

// Themed StyleSheet: returns a hook that builds the sheet from the active
// scheme's colors and memoizes it until the scheme changes.
type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };
export function makeStyles<T extends NamedStyles<T>>(
  factory: (colors: ThemeColors) => T,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}



export const fonts = {
  regular: "Jakarta-Regular",
  medium: "Jakarta-Medium",
  semibold: "Jakarta-SemiBold",
  bold: "Jakarta-Bold",
  extrabold: "Jakarta-ExtraBold",
};

export const spacing = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64 };
export const radius = { sm: 8, md: 16, lg: 24, pill: 999 };
export const type = { sm: 14, base: 18, lg: 22, xl: 28, xxl: 36 };

export const CATEGORY_COLORS = [
  "categoryPeople", "categoryActions", "categoryNouns", "categoryFeelings",
  "categoryPlaces", "categoryNeeds", "categoryActivities", "categorySchool",
] as const;

// Category accent lookup; tint adds ~15% alpha to the token color.
export function catColor(colors: ThemeColors, key?: string): string {
  return (colors as Record<string, string>)[key || ""] || colors.categoryActivities;
}
export function tint(hex: string, alpha = "26"): string {
  return hex.startsWith("#") && hex.length === 7 ? hex + alpha : hex;
}
