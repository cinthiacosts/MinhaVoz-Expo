import { PendingScreen } from "@/src/navigation-ui";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { RoutineSection } from "@/src/comm/Sections";
import { cacheBoard } from "@/src/offline";
import { fonts, makeStyles, spacing } from "@/src/theme";
import { useToast } from "@/src/toast";
import { speak } from "@/src/tts";
import { AppHeader, BigButton } from "@/src/ui";
import { useBoard } from "@/src/useBoard";

export default function CareSupport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const styles = useStyles();
  const toast = useToast();
  const { board, setBoard } = useBoard(id);
  const [tab, setTab] = useState<"rotina" | "orientacoes">("rotina");
  if (!board) return <PendingScreen destination={`/usuario/${id}`} />;
  if (board.comm_user.my_role !== "cuidador") return <Redirect href={`/usuario/${id}`} />;
  const say = async (text: string) => {
    try { await speak(text, { voice: board.settings.voice, speed: board.settings.speech_rate, volume: board.settings.volume }); }
    catch (e: any) { toast(e.message, "error"); }
  };
  return <View style={styles.root}>
    <AppHeader title="Apoio ao cuidado" subtitle={board.comm_user.name} onBack={() => router.replace(`/usuario/${id}`)} />
    <View style={styles.intro}>
      <Text style={styles.body}>Execute as rotinas de casa e consulte somente as orientações ativas destinadas à pessoa comunicadora. Alterações de conteúdo e configurações ficam com o Responsável.</Text>
      <View style={styles.tabs}>
        <BigButton label="Rotina cotidiana" variant={tab === "rotina" ? "primary" : "outline"} onPress={() => setTab("rotina")} testID="care-routine-tab" style={{ flex: 1 }} />
        <BigButton label="Orientações para a pessoa" variant="outline" onPress={() => setTab("orientacoes")} testID="care-guidance-tab" style={{ flex: 1 }} />
      </View>
    </View>
    {tab === "rotina" ? <RoutineSection board={board} say={say} bottomPad={24} onChange={(routine) => {
      const next = { ...board, routines: board.routines.map((r) => r.id === routine.id ? routine : r) };
      setBoard(next); cacheBoard(id, next);
    }} /> : <ScrollView contentContainerStyle={styles.content}>
      {!board.activities.length && <Text style={styles.body}>Nenhuma orientação disponível.</Text>}
      {board.activities.map((activity) => <View key={activity.id} style={styles.card}>
        <Text style={styles.title}>{activity.title}</Text>
        <Text style={styles.body}>{activity.display_text || activity.instruction}</Text>
        <Text style={styles.body}>{activity.status === "realizada" ? "Realizada" : "Pendente"}</Text>
        <BigButton label="Falar orientação" onPress={() => say(activity.instruction)} testID={`care-speak-${activity.id}`} />
      </View>)}
    </ScrollView>}
  </View>;
}
const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  intro: { padding: spacing.md, gap: 12 },
  content: { padding: spacing.md, paddingBottom: 48, gap: spacing.md },
  tabs: { flexDirection: "row", gap: 8 },
  body: { fontFamily: fonts.regular, fontSize: 16, color: c.onSurface },
  title: { fontFamily: fonts.bold, fontSize: 19, color: c.onSurface },
  card: { padding: spacing.md, borderWidth: 1, borderColor: c.border, borderRadius: 12, gap: 8 },
}));
