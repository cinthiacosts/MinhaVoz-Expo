import { PendingScreen } from "@/src/navigation-ui";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import { speak } from "@/src/tts";
import { Phrase } from "@/src/types";
import { AppHeader, BigButton, ConfirmSheet, EmojiPicker, Field, IconBtn, Sheet } from "@/src/ui";
import { useBoard } from "@/src/useBoard";

export default function PhrasesEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const { board, reload } = useBoard(id);
  const [sheet, setSheet] = useState<{ edit?: Phrase } | null>(null);
  const [f, setF] = useState({ text: "", emoji: "💬" });
  const [del, setDel] = useState<Phrase | null>(null);
  const [saving, setSaving] = useState(false);

  if (!board) return <PendingScreen destination={`/usuario/${id}`} />;
  if (board.comm_user.my_role === "cuidador") return <Redirect href={`/usuario/${id}/cuidado`} />;

  const run = async (fn: () => Promise<any>, ok?: string) => {
    try {
      await fn();
      if (ok) toast(ok, "success");
      await reload();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const open = (edit?: Phrase) => {
    setF(edit ? { text: edit.text, emoji: edit.emoji || "💬" } : { text: "", emoji: "💬" });
    setSheet({ edit });
  };

  const save = async () => {
    if (!f.text.trim()) return toast("Escreva a frase", "error");
    setSaving(true);
    await run(async () => {
      if (sheet?.edit) await api(`/phrases/${sheet.edit.id}`, { method: "PUT", body: f });
      else await api(`/comm-users/${id}/phrases`, { method: "POST", body: f });
      setSheet(null);
    }, "Frase salva");
    setSaving(false);
  };

  return (
    <View style={styles.root}>
      <AppHeader
        title={board.comm_user.my_role === "professor" ? "Minhas frases escolares" : "Frases rápidas"}
        subtitle={board.comm_user.name}
        onBack={() => router.replace(`/usuario/${id}`)}
        right={<IconBtn icon="add" label="Nova frase" bg={colors.brandPrimary} color={colors.onBrandPrimary} onPress={() => open()} testID="phrases-add-button" />}
      />
      <FlatList
        data={board.comm_user.my_role === "professor" ? board.quick_phrases.filter((p) => p.can_edit) : board.quick_phrases}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.lg }]}
        ListHeaderComponent={<Text style={styles.lead}>Frases faladas com um único toque no Modo Comunicação. Marque ⭐ para aparecer em Favoritos.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row} testID={`phrase-row-${item.id}`}>
            <Text style={{ fontSize: 30 }}>{item.emoji}</Text>
            <Text style={styles.text}>{item.text}</Text>
            <IconBtn
              icon="volume-high-outline"
              size={40}
              label="Ouvir"
              onPress={() => speak(item.text, { voice: board.settings.voice, speed: board.settings.speech_rate, volume: board.settings.volume }).catch((e) => toast(e.message, "error"))}
              testID={`phrase-play-${item.id}`}
            />
            <IconBtn
              icon={item.favorite ? "star" : "star-outline"}
              size={40}
              color={item.favorite ? colors.favorite : colors.muted}
              label="Favorito"
              onPress={() => run(() => api(`/phrases/${item.id}`, { method: "PUT", body: { favorite: !item.favorite } }))}
              testID={`phrase-fav-${item.id}`}
            />
            <IconBtn icon="create-outline" size={40} label="Editar" onPress={() => open(item)} testID={`phrase-edit-${item.id}`} />
            <IconBtn icon="trash-outline" size={40} color={colors.error} label="Excluir" onPress={() => setDel(item)} testID={`phrase-delete-${item.id}`} />
          </View>
        )}
      />
      <Sheet visible={!!sheet} onClose={() => setSheet(null)} title={sheet?.edit ? "Editar frase" : "Nova frase rápida"} testID="phrase-sheet">
        <View style={{ gap: spacing.md }}>
          <Field label="Frase" value={f.text} onChangeText={(v) => setF((p) => ({ ...p, text: v }))} placeholder="Ex.: Quero brincar lá fora." testID="phrase-text-input" autoFocus />
          <Text style={styles.label}>Ícone</Text>
          <EmojiPicker value={f.emoji} onChange={(e) => setF((p) => ({ ...p, emoji: e }))} testID="phrase-emoji" />
          <BigButton label="Salvar frase" onPress={save} loading={saving} testID="phrase-save-button" />
        </View>
      </Sheet>
      <ConfirmSheet
        visible={!!del}
        title="Excluir frase?"
        text={`“${del?.text}”`}
        confirmLabel="Excluir"
        onClose={() => setDel(null)}
        onConfirm={() => {
          const p = del!;
          setDel(null);
          run(() => api(`/phrases/${p.id}`, { method: "DELETE" }), "Frase excluída");
        }}
        testID="delete-phrase-confirm"
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  list: { padding: spacing.md, gap: 8 },
  lead: { fontFamily: fonts.regular, fontSize: 15, color: c.muted, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, minHeight: 68 },
  text: { flex: 1, fontFamily: fonts.bold, fontSize: 17, color: c.onSurface },
  label: { fontFamily: fonts.bold, fontSize: 16, color: c.onSurface },
}));
