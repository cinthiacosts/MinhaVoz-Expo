import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { brandPalette as color, brandGradient as entryGradient, fonts, makeStyles } from "@/src/theme";
import { IconName, Loading } from "@/src/ui";

const roles: { key: string; name: string; text: string; icon: IconName; background: string; tint: string; iconBackground: string }[] = [
  { key: "responsavel", name: "Responsável", text: "Acompanha e personaliza o aplicativo.", icon: "people-outline", background: color.pinkCard, tint: color.pink, iconBackground: color.pinkIcon },
  { key: "cuidador", name: "Cuidador", text: "Apoia a comunicação no dia a dia.", icon: "heart-outline", background: color.greenCard, tint: color.green, iconBackground: color.greenIcon },
  { key: "professor", name: "Professor", text: "Atividades e rotina escolar.", icon: "school-outline", background: color.blueCard, tint: color.school, iconBackground: color.blueIcon },
  { key: "terapeuta", name: "Terapeuta", text: "Acompanha a evolução e os objetivos.", icon: "pulse-outline", background: color.purpleCard, tint: color.therapist, iconBackground: color.purpleIcon },
];

function WelcomeWaves() {
  const styles = useStyles();
  return <View style={styles.decoration} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="welcome-decoration">
    <Image source={require("../assets/images/welcome-wave-top.svg")} contentFit="fill" style={styles.topWaves} accessible={false} />
    <Image source={require("../assets/images/welcome-wave-bottom.svg")} contentFit="fill" style={styles.bottomWaves} accessible={false} />
  </View>;
}

export default function Welcome() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { width, fontScale } = useWindowDimensions();
  const [focusedAction, setFocusedAction] = useState<string | null>(null);
  const compactCards = width < 380 || fontScale > 1.25;
  const roomy = width >= 620;
  const logoSize = roomy ? 160 : Math.min(180, Math.max(148, width * 0.39));

  if (!ready) return <Loading testID="splash-loading" />;
  if (user) return <Redirect href={user.role ? "/painel" : "/perfil"} />;

  return <View style={styles.root}>
    <WelcomeWaves />
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + (roomy ? 40 : 64) }]} testID="welcome-screen">
      <View style={styles.content}>
        <View style={styles.header}>
          <Image source={require("../assets/images/minhavoz-logo-oficial.png")} contentFit="contain" style={{ width: logoSize, height: logoSize, borderRadius: logoSize * 0.22 }} accessible accessibilityLabel="Minha Voz — logo oficial" testID="welcome-title" />
          <View style={styles.slogan} testID="welcome-slogan">
            <Text style={[styles.sloganLine, roomy && styles.sloganRoomy]}>Cada toque vira uma palavra.</Text>
            <Text style={[styles.sloganLine, roomy && styles.sloganRoomy, styles.sloganAccent]}>
              Cada palavra, <Text style={styles.sloganBlue}>uma conversa.</Text>
            </Text>
          </View>
        </View>

        <View style={[styles.supportCard, roomy && styles.supportRoomy]} testID="welcome-support-card">
          <Text style={[styles.cardTitle, roomy && styles.cardTitleRoomy]} accessibilityRole="header">O Minha Voz é para toda a rede de apoio</Text>
          <View style={styles.grid}>
            {[roles.slice(0, 2), roles.slice(2)].map((row, index) => <View key={index} style={styles.gridRow}>
              {row.map((role) => <View key={role.key} style={[styles.roleCard, { backgroundColor: role.background }, compactCards && styles.roleCardCompact, roomy && styles.roleCardRoomy]} testID={`welcome-role-${role.key}`}>
                <View style={[styles.roleIcon, { backgroundColor: role.iconBackground }, roomy && styles.roleIconRoomy]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Ionicons name={role.icon} size={roomy ? 30 : 24} color={role.tint} />
                </View>
                <View style={[styles.roleCopy, compactCards && styles.roleCopyCompact]}>
                  <Text style={[styles.roleName, roomy && styles.roleNameRoomy]}>{role.name}</Text>
                  <Text style={styles.roleDescription}>{role.text}</Text>
                </View>
              </View>)}
            </View>)}
          </View>
          <View style={styles.notice} testID="welcome-notice">
            <View style={styles.infoIcon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Ionicons name="information-circle" size={26} color={color.school} />
            </View>
            <View style={styles.noticeCopy}>
              <Text style={styles.noticeTitle}>A pessoa que se comunica não precisa de conta.</Text>
              <Text style={styles.noticeText}>A rede de apoio configura o aplicativo para ela.</Text>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable onPress={() => router.push("/login")} onFocus={() => setFocusedAction("login")} onBlur={() => setFocusedAction(null)} accessibilityRole="button" accessibilityLabel="ENTRAR" testID="welcome-login-button" style={({ pressed }) => [styles.primaryButton, focusedAction === "login" && styles.focused, pressed && styles.pressed]}>
            <LinearGradient colors={entryGradient} locations={[0, 0.5, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryFill}>
              <Ionicons name="log-in-outline" size={26} color={color.white} />
              <Text style={styles.primaryText}>ENTRAR</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={() => router.push("/cadastro")} onFocus={() => setFocusedAction("register")} onBlur={() => setFocusedAction(null)} accessibilityRole="button" accessibilityLabel="CRIAR CONTA" testID="welcome-register-button" style={({ pressed }) => [styles.secondaryButton, focusedAction === "register" && styles.focused, pressed && styles.pressed]}>
            <Ionicons name="person-add-outline" size={26} color={color.purple} />
            <Text style={styles.secondaryText}>CRIAR CONTA</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  </View>;
}

const useStyles = makeStyles(() => ({
  root: { flex: 1, backgroundColor: color.white },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  content: { width: "100%", maxWidth: 700, gap: 20 },
  header: { alignItems: "center", gap: 18 },
  slogan: { width: "100%", gap: 2 },
  sloganLine: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 27, color: color.ink, textAlign: "center" },
  sloganRoomy: { fontSize: 23, lineHeight: 33 },
  sloganAccent: { color: color.purple },
  sloganBlue: { color: color.blue },
  supportCard: { backgroundColor: color.white, borderRadius: 26, borderWidth: 1, borderColor: color.border, padding: 12, gap: 16, shadowColor: color.shadow, shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  supportRoomy: { padding: 20, gap: 18 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 26, textAlign: "center", color: color.ink, paddingHorizontal: 4 },
  cardTitleRoomy: { fontSize: 21, lineHeight: 29 },
  grid: { gap: 12 },
  gridRow: { flexDirection: "row", alignItems: "stretch", gap: 10 },
  roleCard: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 18, minHeight: 126 },
  roleCardCompact: { flexDirection: "column", alignItems: "flex-start", gap: 8, padding: 10 },
  roleCardRoomy: { minHeight: 112, padding: 16, gap: 12 },
  roleIcon: { width: 34, height: 38, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  roleIconRoomy: { width: 48, height: 52, borderRadius: 18 },
  roleCopy: { flex: 1, minWidth: 0, gap: 5 },
  roleCopyCompact: { flex: 0, width: "100%" },
  roleName: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 21, color: color.ink },
  roleNameRoomy: { fontSize: 17, lineHeight: 25 },
  roleDescription: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: color.body },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 18, backgroundColor: color.blueCard, padding: 12 },
  infoIcon: { paddingTop: 1 },
  noticeCopy: { flex: 1, minWidth: 0, gap: 3 },
  noticeTitle: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 21, color: color.ink },
  noticeText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: color.body },
  actions: { gap: 12 },
  primaryButton: { borderRadius: 36, borderWidth: 2, borderColor: color.white, padding: 2, overflow: "hidden" },
  primaryFill: { minHeight: 64, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 32, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  primaryText: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 22, lineHeight: 30, textAlign: "center", color: color.white },
  secondaryButton: { minHeight: 64, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 32, borderWidth: 2, borderColor: color.outline, backgroundColor: color.white, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  secondaryText: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 20, lineHeight: 28, textAlign: "center", color: color.purple },
  pressed: { opacity: 0.88 },
  focused: { borderColor: color.ink },
  decoration: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, overflow: "hidden" },
  topWaves: { position: "absolute", top: 0, left: 0, right: 0, height: 120 },
  bottomWaves: { position: "absolute", bottom: 0, left: 0, right: 0, height: 90 },
}));
