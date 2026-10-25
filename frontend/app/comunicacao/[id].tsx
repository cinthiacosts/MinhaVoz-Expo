import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useLocalSearchParams, usePreventRemove, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, BackHandler, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { PendingScreen } from "@/src/navigation-ui";
import { BoardSection } from "@/src/comm/BoardSection";
import { ExitGuard } from "@/src/comm/ExitGuard";
import { Say } from "@/src/comm/PictoCard";
import { FavoritesSection, PhrasesSection, RoutineSection, SchoolSection } from "@/src/comm/Sections";
import { WriteSection } from "@/src/comm/WriteSection";
import { cacheBoard, flushQueue, loadBoard, queueEvent } from "@/src/offline";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import { speak, stop } from "@/src/tts";
import { Board } from "@/src/types";
import { BigButton, IconName, tap } from "@/src/ui";

type Tab = "prancha" | "escrever" | "frases" | "escola" | "rotina" | "favoritos";
const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: "prancha", label: "Prancha", icon: "grid" },
  { key: "escrever", label: "Escrever", icon: "create" },
  { key: "frases", label: "Frases", icon: "chatbox-ellipses" },
  { key: "escola", label: "Escola", icon: "school" },
  { key: "rotina", label: "Rotina", icon: "list" },
  { key: "favoritos", label: "Favoritos", icon: "star" },
];

export default function CommunicationMode() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const [board, setBoard] = useState<Board | null>(null);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("prancha");
  const [speaking, setSpeaking] = useState(false);
  const [guard, setGuard] = useState(false);
  const [exitApproved, setExitApproved] = useState(false);
  const disableExitPrevention = usePreventRemove(!!board && !failed && !exitApproved, () => setGuard(true));
  const session = useRef<string | null>(null);
  const speechSequence = useRef(0);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const r = await loadBoard(id);
      setBoard(r.board);
      setOffline(r.offline);
    } catch {
      setFailed(true);
    }
  }, [id]);

  useEffect(() => {
    load();
    api<{ id: string }>(`/comm-users/${id}/sessions/start`, { method: "POST" })
      .then((s) => (session.current = s.id))
      .catch(() => {});
    const timer = setInterval(() => flushQueue(), 30000);
    const back = Platform.OS !== "web" ? BackHandler.addEventListener("hardwareBackPress", () => {
      setGuard(true);
      return true; // never leave the board by accident
    }) : null;
    const app = AppState.addEventListener("change", (st) => {
      if (st !== "active") stop();
    });
    return () => {
      clearInterval(timer);
      back?.remove();
      app.remove();
      stop();
      if (session.current) api(`/sessions/${session.current}/end`, { method: "POST", body: {} }).catch(() => {});
      flushQueue();
    };
  }, [id, load]);

  const say: Say = useCallback(
    async (text, ev) => {
      if (!board || !text.trim()) return;
      const s = board.settings;
      const currentSpeech = ++speechSequence.current;
      setSpeaking(true);
      try {
        await speak(text, { voice: s.voice, speed: s.speech_rate, volume: s.volume });
        if (ev) queueEvent(id, { text, ...ev, session_id: session.current });
      } catch (e: any) {
        toast(e.message || "Não foi possível falar agora", "error");
      } finally {
        if (currentSpeech === speechSequence.current) setSpeaking(false);
      }
    },
    [board, id, toast],
  );

  if (failed)
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]} testID="comm-error">
        <Text style={{ fontSize: 56 }}>📶</Text>
        <Text style={styles.errTitle}>Sem conexão</Text>
        <Text style={styles.errText}>Abra esta prancha uma vez com internet para que ela fique disponível offline.</Text>
        <BigButton label="Tentar novamente" icon="refresh" onPress={load} testID="comm-retry-button" />
        <BigButton label="Voltar" variant="ghost" onPress={() => router.replace("/painel")} testID="comm-error-back-button" />
      </View>
    );
  if (!board) return <PendingScreen destination="/painel" testID="comm-loading" />;

  const bottomPad = spacing.md;
  const props = { board, say, speaking, bottomPad };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="communication-mode">
      <View style={styles.top}>
        <View style={styles.who}>
          <Text style={styles.name} numberOfLines={1}>
            {board.comm_user.name}
          </Text>
          {offline ? (
            <View style={styles.offline} testID="comm-offline-badge">
              <Ionicons name="cloud-offline-outline" size={14} color={colors.onWarning} />
              <Text style={styles.offlineText}>Offline</Text>
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={() => setGuard(true)}
          onLongPress={() => setGuard(true)}
          delayLongPress={1500}
          style={styles.lock}
          accessibilityRole="button"
          accessibilityLabel="Sair do modo comunicação. Pressione e segure."
          accessibilityHint="Ação do adulto responsável"
          testID="comm-exit-lock-button"
        >
          <Ionicons name="lock-closed" size={18} color={colors.muted} />
          <Text style={styles.lockText}>Segure para sair</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        {tab === "prancha" && <BoardSection {...props} />}
        {tab === "escrever" && <WriteSection {...props} />}
        {tab === "frases" && <PhrasesSection {...props} />}
        {tab === "escola" && <SchoolSection {...props} />}
        {tab === "favoritos" && <FavoritesSection {...props} />}
        {tab === "rotina" && (
          <RoutineSection
            {...props}
            onChange={(r) => {
              const nb = { ...board, routines: board.routines.map((x) => (x.id === r.id ? r : x)) };
              setBoard(nb);
              cacheBoard(id, nb);
            }}
          />
        )}
      </View>

      <View style={[styles.nav, { paddingBottom: insets.bottom + 6 }]} accessibilityRole="tablist">
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => {
                tap();
                stop();
                setTab(t.key);
              }}
              style={[styles.navItem, on && styles.navItemOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t.label}
              testID={`comm-tab-${t.key}`}
            >
              <Ionicons name={on ? t.icon : (`${t.icon}-outline` as IconName)} size={26} color={on ? colors.onSurfaceInverse : colors.onSurfaceTertiary} />
              <Text style={[styles.navText, on && { color: colors.onSurfaceInverse }]} numberOfLines={1} adjustsFontSizeToFit>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ExitGuard
        visible={guard}
        onClose={() => setGuard(false)}
        onExit={() => {
          setExitApproved(true);
          disableExitPrevention();
          setGuard(false);
          stop();
          router.replace(`/usuario/${id}`);
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  center: { alignItems: "center", justifyContent: "center", padding: spacing.lg, gap: spacing.md },
  errTitle: { fontFamily: fonts.extrabold, fontSize: 24, color: c.onSurface },
  errText: { fontFamily: fonts.regular, fontSize: 17, color: c.muted, textAlign: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: 6, gap: 8 },
  who: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  name: { fontFamily: fonts.extrabold, fontSize: 20, color: c.onSurface, flexShrink: 1 },
  offline: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.warning, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  offlineText: { fontFamily: fonts.bold, fontSize: 12, color: c.onWarning },
  lock: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border },
  lockText: { fontFamily: fonts.medium, fontSize: 12, color: c.muted },
  nav: { flexDirection: "row", gap: 4, paddingHorizontal: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surfaceSecondary },
  navItem: { flex: 1, minHeight: 64, borderRadius: radius.md, alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: 2 },
  navItemOn: { backgroundColor: c.surfaceInverse },
  navText: { fontFamily: fonts.bold, fontSize: 12, color: c.onSurfaceTertiary },
}));
