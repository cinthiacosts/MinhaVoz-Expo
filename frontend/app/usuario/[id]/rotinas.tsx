import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import { CommUser, Routine, Step } from "@/src/types";
import { AppHeader, BigButton, Choice, ConfirmSheet, EMOJIS, EmptyState, Field, IconBtn, Loading, Sheet } from "@/src/ui";

const SCHOOL_TEMPLATE: Step[] = [
  { label: "Chegar à escola", emoji: "🏫", done: false },
  { label: "Guardar mochila", emoji: "🎒", done: false },
  { label: "Aula de Português", emoji: "📖", done: false },
  { label: "Lanche", emoji: "🍎", done: false },
  { label: "Matemática", emoji: "➕", done: false },
  { label: "Artes", emoji: "🎨", done: false },
  { label: "Ir para casa", emoji: "🏠", done: false },
];

const CONTEXTS = [
  { value: "casa", label: "Casa" },
  { value: "escola", label: "Escola" },
  { value: "terapia", label: "Terapia" },
  { value: "outro", label: "Outro" },
];

export default function Routines() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const [items, setItems] = useState<Routine[] | null>(null);
  const [sheet, setSheet] = useState<{ edit?: Routine } | null>(null);
  const [title, setTitle] = useState("");
  const [ctx, setCtx] = useState("casa");
  const [steps, setSteps] = useState<Step[]>([]);
  const [emojiFor, setEmojiFor] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<Routine | null>(null);
  const [schoolOnly, setSchoolOnly] = useState(false);

  const load = useCallback(async () => {
    try {
      const profile = await api<CommUser>(`/comm-users/${id}`);
      if (profile.my_role === "cuidador") { setItems([]); router.replace(`/usuario/${id}/cuidado`); return; }
      setSchoolOnly(profile.my_role === "professor");
      setItems(await api<Routine[]>(`/comm-users/${id}/routines`));
    } catch (e: any) {
      toast(e.message, "error");
      setItems([]);
    }
  }, [id, toast, router]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const open = (edit?: Routine, template?: boolean) => {
    setTitle(edit?.title ?? (template ? "Rotina da escola" : ""));
    setCtx(edit?.context ?? (template || schoolOnly ? "escola" : "casa"));
    setSteps(edit?.steps ?? (template ? SCHOOL_TEMPLATE : [{ label: "", emoji: "⭐", done: false }]));
    setSheet({ edit });
  };

  const upd = (i: number, patch: Partial<Step>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) =>
    setSteps((s) => {
      const j = i + d;
      if (j < 0 || j >= s.length) return s;
      const n = [...s];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const save = async () => {
    const clean = steps.filter((s) => s.label.trim());
    if (!title.trim() || !clean.length) return toast("Informe o título e pelo menos uma etapa", "error");
    setSaving(true);
    try {
      const body = { title: title.trim(), context: ctx, steps: clean };
      if (sheet?.edit) await api(`/routines/${sheet.edit.id}`, { method: "PUT", body });
      else await api(`/comm-users/${id}/routines`, { method: "POST", body });
      toast("Rotina salva", "success");
      setSheet(null);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader
        title={schoolOnly ? "Rotinas escolares" : "Rotina visual"}
        subtitle="O que acontece agora e depois"
        onBack={() => router.replace(`/usuario/${id}`)}
        right={<IconBtn icon="add" label="Nova rotina" bg={colors.brandPrimary} color={colors.onBrandPrimary} onPress={() => open()} testID="routine-add-button" />}
      />
      {items === null ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.lg }]}
          ListHeaderComponent={<BigButton label="Usar modelo: rotina da escola" icon="school-outline" variant="outline" onPress={() => open(undefined, true)} testID="routine-template-button" />}
          ListEmptyComponent={<EmptyState emoji="🗓️" title="Nenhuma rotina ainda" text="Monte uma sequência visual para casa, escola ou terapia." testID="routines-empty" />}
          renderItem={({ item }) => {
            const done = item.steps.filter((s) => s.done).length;
            return (
              <View style={styles.card} testID={`routine-card-${item.id}`}>
                <View style={styles.cardHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text style={styles.meta}>
                      {CONTEXTS.find((c) => c.value === item.context)?.label} · {done}/{item.steps.length} concluídas
                    </Text>
                  </View>
                  <IconBtn icon="create-outline" size={40} label="Editar" onPress={() => open(item)} testID={`routine-edit-${item.id}`} />
                  <IconBtn icon="trash-outline" size={40} color={colors.error} label="Excluir" onPress={() => setDel(item)} testID={`routine-delete-${item.id}`} />
                </View>
                <Text style={styles.steps}>{item.steps.map((s, i) => `${i + 1}. ${s.emoji} ${s.label}`).join("   ")}</Text>
              </View>
            );
          }}
        />
      )}
      <Sheet visible={!!sheet} onClose={() => setSheet(null)} title={sheet?.edit ? "Editar rotina" : "Nova rotina"} testID="routine-sheet">
        <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.md }} keyboardShouldPersistTaps="handled">
          <Field label="Título" value={title} onChangeText={setTitle} placeholder="Ex.: Manhã em casa" testID="routine-title-input" />
          <Choice options={schoolOnly ? CONTEXTS.filter((c) => c.value === "escola") : CONTEXTS} value={ctx} onChange={setCtx} testID="routine-context" />
          <Text style={styles.label}>Etapas</Text>
          {steps.map((s, i) => (
            <View key={i} style={styles.stepRow} testID={`routine-step-row-${i}`}>
              <Pressable onPress={() => setEmojiFor(emojiFor === i ? null : i)} style={styles.stepEmoji} testID={`routine-step-emoji-${i}`} accessibilityLabel="Escolher ícone">
                <Text style={{ fontSize: 26 }}>{s.emoji}</Text>
              </Pressable>
              <TextInput value={s.label} onChangeText={(v) => upd(i, { label: v })} placeholder={`Etapa ${i + 1}`} placeholderTextColor={colors.muted} style={styles.stepInput} testID={`routine-step-input-${i}`} />
              <IconBtn icon="arrow-up" size={36} label="Subir" onPress={() => move(i, -1)} testID={`routine-step-up-${i}`} />
              <IconBtn icon="close" size={36} label="Remover etapa" onPress={() => setSteps((x) => x.filter((_, j) => j !== i))} testID={`routine-step-remove-${i}`} />
              {emojiFor === i ? (
                <View style={styles.emojiGrid}>
                  {EMOJIS.map((e) => (
                    <Pressable
                      key={e}
                      onPress={() => {
                        upd(i, { emoji: e });
                        setEmojiFor(null);
                      }}
                      style={styles.emojiCell}
                    >
                      <Text style={{ fontSize: 24 }}>{e}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
          <BigButton label="Adicionar etapa" icon="add" variant="ghost" height={52} onPress={() => setSteps((s) => [...s, { label: "", emoji: "⭐", done: false }])} testID="routine-add-step-button" />
          <BigButton label="Salvar rotina" onPress={save} loading={saving} testID="routine-save-button" />
        </KeyboardAwareScrollView>
      </Sheet>
      <ConfirmSheet
        visible={!!del}
        title="Excluir rotina?"
        text={`“${del?.title}” será removida.`}
        confirmLabel="Excluir"
        onClose={() => setDel(null)}
        onConfirm={async () => {
          const r = del!;
          setDel(null);
          try {
            await api(`/routines/${r.id}`, { method: "DELETE" });
            load();
          } catch (e: any) {
            toast(e.message, "error");
          }
        }}
        testID="delete-routine-confirm"
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  list: { padding: spacing.md, gap: 10 },
  card: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, gap: 8 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontFamily: fonts.extrabold, fontSize: 18, color: c.onSurface },
  meta: { fontFamily: fonts.medium, fontSize: 14, color: c.muted },
  steps: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 24, color: c.onSurfaceSecondary },
  label: { fontFamily: fonts.bold, fontSize: 16, color: c.onSurface },
  stepRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  stepEmoji: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  stepInput: { flex: 1, minHeight: 52, borderWidth: 1.5, borderColor: c.borderStrong, borderRadius: radius.md, paddingHorizontal: 12, fontFamily: fonts.medium, fontSize: 17, color: c.onSurface, backgroundColor: c.surfaceSecondary },
  emojiGrid: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 4, padding: 6, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  emojiCell: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
}));
