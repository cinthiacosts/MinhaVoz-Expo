import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api } from "@/src/api";
import { flushQueue } from "@/src/offline";
import { fonts, makeStyles, spacing } from "@/src/theme";
import { useToast } from "@/src/toast";
import { SOURCE_LABEL } from "@/src/types";
import { AppHeader, Loading } from "@/src/ui";

type SchoolStats = { my_school_phrases: number; pending_activities: number; completed_activities: number };
type SchoolEvent = { id: string; text: string; source: string; created_at: string };

export default function SchoolUse() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const styles = useStyles();
  const [stats, setStats] = useState<SchoolStats | null>(null);
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [error, setError] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    setError(false);
    (async () => {
      try {
        await flushQueue();
        const [summary, history] = await Promise.all([
          api<SchoolStats>(`/comm-users/${id}/school/stats`),
          api<SchoolEvent[]>(`/comm-users/${id}/school/history`),
        ]);
        if (active) { setStats(summary); setEvents(history); }
      } catch (e: any) {
        if (active) { setStats(null); setEvents([]); setError(true); toast(e.message, "error"); }
      }
    })();
    return () => { active = false; };
  }, [id, toast]));
  return <View style={styles.root}>
    <AppHeader title="Uso escolar" subtitle="Visão limitada do Professor" onBack={() => router.replace(`/usuario/${id}`)} />
    {error ? <Text style={styles.body}>Não foi possível acessar a visão escolar.</Text> : !stats ? <Loading /> :
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.body}>Somente comunicações novas registradas pela sua conta com vínculo de Professor. Registros antigos sem contexto comprovado, uso de casa/terapia e comunicações de outras contas não são exibidos.</Text>
        <Text style={styles.title}>Suas frases escolares nos últimos 14 dias: {stats.my_school_phrases}</Text>
        <Text style={styles.body}>Atividades ativas do aluno: {stats.pending_activities} pendentes · {stats.completed_activities} realizadas.</Text>
        <Text style={styles.title}>Suas comunicações escolares recentes</Text>
        {!events.length && <Text style={styles.body}>Nenhum registro disponível neste escopo.</Text>}
        {events.map((event) => <View key={event.id} style={styles.card}>
          <Text style={styles.body}>{event.text}</Text>
          <Text style={styles.meta}>{new Date(event.created_at).toLocaleString("pt-BR")} · {SOURCE_LABEL[event.source] ?? event.source}</Text>
        </View>)}
      </ScrollView>}
  </View>;
}
const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.md, paddingBottom: 48, gap: spacing.md },
  title: { fontFamily: fonts.bold, fontSize: 19, color: c.onSurface },
  body: { fontFamily: fonts.regular, fontSize: 16, color: c.onSurface },
  meta: { fontFamily: fonts.regular, fontSize: 13, color: c.muted },
  card: { padding: spacing.md, borderWidth: 1, borderColor: c.border, borderRadius: 12, gap: 8 },
}));
