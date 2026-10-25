import { PendingScreen } from "@/src/navigation-ui";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { catColor, fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import { availableVoices, prepareOffline, speak, speechOf } from "@/src/tts";
import { Settings } from "@/src/types";
import { AppHeader, BigButton, Choice, SectionTitle } from "@/src/ui";
import { useBoard } from "@/src/useBoard";



export default function SettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const { board, setBoard } = useBoard(id);
  const [voices, setVoices] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => { availableVoices().then(setVoices).catch(() => setVoices([])); }, []);
  const [prep, setPrep] = useState<string | null>(null);

  if (!board) return <PendingScreen destination={`/usuario/${id}`} />;
  if (board.comm_user.my_role === "cuidador") return <Redirect href={`/usuario/${id}/cuidado`} />;
  const s = board.settings;

  const update = async (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setBoard({ ...board, settings: next });
    try {
      await api(`/comm-users/${id}/settings`, { method: "PUT", body: patch });
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const toggleCat = (key: string) => {
    const hidden = s.hidden_categories.includes(key) ? s.hidden_categories.filter((k) => k !== key) : [...s.hidden_categories, key];
    update({ hidden_categories: hidden });
  };

  const test = () => speak("Olá! Esta é a minha voz.", { voice: s.voice, speed: s.speech_rate, volume: s.volume }).catch((e) => toast(e.message, "error"));

  const prepare = async () => {
    const texts = [...board.pictograms.map(speechOf), ...board.pictograms.map((p) => p.name), ...board.quick_phrases.map((p) => p.text), ...board.activities.map((a) => a.instruction)];
    setPrep("Preparando...");
    try {
    const r = await prepareOffline(texts, { voice: s.voice, speed: s.speech_rate, volume: s.volume }, (d, t) => setPrep(`Preparando ${d} de ${t}...`));
    setPrep(null);
    toast(r.failed ? "Não foi possível verificar a voz" : "Voz de português encontrada. Confirme a fala em modo avião no aparelho.", r.failed ? "info" : "success");
    } catch (e: any) { toast(e.message, "error"); } finally { setPrep(null); }
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Configurações" subtitle={board.comm_user.name} onBack={() => router.replace(`/usuario/${id}`)} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
        <SectionTitle>Prancha</SectionTitle>
        <Text style={styles.label}>Tamanho dos pictogramas</Text>
        <Choice options={[{ value: "medio", label: "Médio" }, { value: "grande", label: "Grande" }, { value: "extra", label: "Extra grande" }]} value={s.pictogram_size} onChange={(v) => update({ pictogram_size: v })} testID="settings-picto-size" />
        <Text style={styles.label}>Tamanho do texto</Text>
        <Choice options={[{ value: "normal", label: "Normal" }, { value: "grande", label: "Grande" }, { value: "extra", label: "Extra grande" }]} value={s.text_size} onChange={(v) => update({ text_size: v })} testID="settings-text-size" />
        <Text style={styles.label}>Pictogramas por linha</Text>
        <Choice options={[{ value: 2, label: "2" }, { value: 3, label: "3" }, { value: 4, label: "4" }]} value={s.grid_columns} onChange={(v) => update({ grid_columns: v })} testID="settings-columns" />
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Falar cada figura ao tocar</Text>
            <Text style={styles.hint}>Feedback sonoro ao montar a frase</Text>
          </View>
          <Switch value={s.speak_on_tap} onValueChange={(v) => update({ speak_on_tap: v })} testID="settings-speak-on-tap" trackColor={{ true: colors.success, false: colors.borderStrong }} />
        </View>

        <SectionTitle>Categorias visíveis</SectionTitle>
        {board.categories.map((c) => (
          <View key={c.key} style={styles.switchRow}>
            <View style={[styles.dot, { backgroundColor: catColor(colors, c.color) }]} />
            <Text style={[styles.label, { flex: 1 }]}>
              {c.emoji} {c.name}
            </Text>
            <Switch value={!s.hidden_categories.includes(c.key)} onValueChange={() => toggleCat(c.key)} testID={`settings-category-${c.key}`} trackColor={{ true: colors.success, false: colors.borderStrong }} />
          </View>
        ))}

        <SectionTitle>Voz</SectionTitle>
        <Text style={styles.label}>Voz</Text>
        <Choice options={[{ value: "device", label: "Português do dispositivo" }, ...voices]} value={voices.some((v) => v.value === s.voice) ? s.voice : "device"} onChange={(v) => update({ voice: v })} testID="settings-voice" />
        <Text style={styles.label}>Velocidade da fala</Text>
        <Choice options={[{ value: 0.75, label: "Devagar" }, { value: 1, label: "Normal" }, { value: 1.25, label: "Rápida" }]} value={s.speech_rate} onChange={(v) => update({ speech_rate: v })} testID="settings-rate" />
        <Text style={styles.label}>Volume</Text>
        <Choice options={[{ value: 0.5, label: "Baixo" }, { value: 0.75, label: "Médio" }, { value: 1, label: "Alto" }]} value={s.volume} onChange={(v) => update({ volume: v })} testID="settings-volume" />
        <BigButton label="Testar voz" icon="volume-high-outline" variant="ghost" onPress={test} testID="settings-test-voice-button" />
        {Platform.OS !== "web" ? (
          <View style={styles.box}>
            <Text style={styles.hint}>A fala usa a síntese do aparelho. Para uso offline, instale uma voz de português nas configurações de síntese de voz do Android.</Text>
            <BigButton label={prep ?? "Verificar voz do aparelho"} icon="cloud-download-outline" variant="secondary" loading={!!prep && false} disabled={!!prep} onPress={prepare} testID="settings-prepare-offline-button" />
          </View>
        ) : null}

        <SectionTitle>Privacidade</SectionTitle>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Registrar histórico de comunicação</Text>
            <Text style={styles.hint}>Visível apenas para a rede de apoio vinculada</Text>
          </View>
          <Switch value={s.history_enabled} onValueChange={(v) => update({ history_enabled: v })} testID="settings-history-enabled" trackColor={{ true: colors.success, false: colors.borderStrong }} />
        </View>

        <SectionTitle>Acessibilidade</SectionTitle>
        <Text style={styles.hint}>
          Todos os botões possuem descrição para leitores de tela (TalkBack/VoiceOver), áreas de toque grandes e alto contraste. Para sair do Modo Comunicação é preciso segurar o cadeado e responder uma pergunta simples.
        </Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.md, gap: spacing.sm },
  label: { fontFamily: fonts.bold, fontSize: 16, color: c.onSurface },
  hint: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: c.muted },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56 },
  dot: { width: 16, height: 16, borderRadius: 8 },
  box: { gap: 10, padding: spacing.md, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
}));
