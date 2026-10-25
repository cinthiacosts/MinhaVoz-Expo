import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { pickImage, uploadImage } from "@/src/media";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import { Activity, CommUser } from "@/src/types";
import { AppHeader, BigButton, Choice, ConfirmSheet, EmojiPicker, EmptyState, Field, IconBtn, Loading, PermissionBlocked, PictoVisual, Sheet } from "@/src/ui";

const SUGGESTIONS = [
  { t: "Abra o livro.", e: "📖" },
  { t: "Pegue o caderno.", e: "📓" },
  { t: "Copie a atividade.", e: "✏️" },
  { t: "Faça a questão 1.", e: "📝" },
  { t: "Vamos para o intervalo.", e: "🍎" },
  { t: "Guarde seu material.", e: "🎒" },
  { t: "Hora da leitura.", e: "📚" },
];

const EMPTY = { title: "", instruction: "", display_text: "", emoji: "📖" };

export default function Activities() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const [items, setItems] = useState<Activity[] | null>(null);
  const [sheet, setSheet] = useState<{ edit?: Activity } | null>(null);
  const [f, setF] = useState(EMPTY);
  const [image, setImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<Activity | null>(null);
  const [kind, setKind] = useState<"atividade" | "aviso">("atividade");
  const [audience, setAudience] = useState<"comunicador" | "rede">("comunicador");

  const load = useCallback(async () => {
    try {
      const profile = await api<CommUser>(`/comm-users/${id}`);
      if (profile.my_role === "cuidador") { setItems([]); router.replace(`/usuario/${id}/cuidado`); return; }
      setItems(await api<Activity[]>(`/comm-users/${id}/activities`));
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

  const open = (edit?: Activity) => {
    setF(edit ? { title: edit.title, instruction: edit.instruction, display_text: edit.display_text || "", emoji: edit.emoji || "📖" } : EMPTY);
    setImage(edit?.image_path || null);
    setKind(edit?.kind ?? "atividade");
    setAudience(edit?.audience ?? "comunicador");
    setBlocked(false);
    setSheet({ edit });
  };

  const choose = async () => {
    const r = await pickImage();
    if (r.status === "blocked") return setBlocked(true);
    if (r.status !== "ok") return;
    setUploading(true);
    try {
      setImage(await uploadImage(r.asset, id));
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!f.title.trim() || !f.instruction.trim()) return toast("Preencha título e orientação", "error");
    setSaving(true);
    try {
      const body = { ...f, image_path: image, kind, audience };
      if (sheet?.edit) await api(`/activities/${sheet.edit.id}`, { method: "PUT", body });
      else await api(`/comm-users/${id}/activities`, { method: "POST", body });
      toast(audience === "rede" ? "Conteúdo disponível para a rede de apoio" : "Conteúdo disponível na área Escola", "success");
      setSheet(null);
      load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (a: Activity) => {
    try {
      await api(`/activities/${a.id}`, { method: "PUT", body: { active: !a.active } });
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader
        title="Atividades escolares"
        subtitle="Atividades e avisos compartilhados"
        onBack={() => router.replace(`/usuario/${id}`)}
        right={<IconBtn icon="add" label="Nova atividade" bg={colors.brandPrimary} color={colors.onBrandPrimary} onPress={() => open()} testID="activity-add-button" />}
      />
      {items === null ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.lg }]}
          ListEmptyComponent={
            <View style={{ gap: spacing.md }}>
              <EmptyState emoji="📖" title="Nenhuma atividade" text="Crie orientações simples e visuais, como “Abra o livro na página 25”." testID="activities-empty" />
              <BigButton label="Nova atividade" icon="add" onPress={() => open()} testID="activities-empty-add-button" />
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, !item.active && { opacity: 0.6 }]} testID={`activity-card-${item.id}`}>
              <View style={styles.visual}>
                <PictoVisual emoji={item.emoji} imagePath={item.image_path} size={36} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.display}>{(item.display_text || item.instruction).toLocaleUpperCase("pt-BR")}</Text>
                <Text style={styles.meta}>
                  {item.kind === "aviso" ? "Aviso" : "Atividade"} · {item.audience === "rede" ? "Somente rede de apoio" : item.active ? "Visível para o aluno" : "Oculta"} · {item.created_by_name}
                </Text>
                <BigButton label={(item.status ?? "pendente") === "realizada" ? "Realizada · marcar pendente" : "Pendente · marcar realizada"}
                  variant="ghost" height={44} onPress={async () => {
                    try { await api(`/activities/${item.id}/status`, { method: "PUT", body: { status: item.status === "realizada" ? "pendente" : "realizada" } }); load(); }
                    catch (e: any) { toast(e.message, "error"); }
                  }} testID={`activity-status-${item.id}`} />
              </View>
              <View style={{ gap: 6, alignItems: "center" }}>
                <Switch value={item.active} onValueChange={() => toggle(item)} testID={`activity-active-${item.id}`} trackColor={{ true: colors.success, false: colors.borderStrong }} />
                <View style={{ flexDirection: "row", gap: 4 }}>
                  <IconBtn icon="create-outline" size={40} label="Editar" onPress={() => open(item)} testID={`activity-edit-${item.id}`} />
                  <IconBtn icon="trash-outline" size={40} color={colors.error} label="Excluir" onPress={() => setDel(item)} testID={`activity-delete-${item.id}`} />
                </View>
              </View>
            </View>
          )}
        />
      )}
      <Sheet visible={!!sheet} onClose={() => setSheet(null)} title={sheet?.edit ? "Editar atividade" : "Nova atividade"} testID="activity-sheet">
        <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.md }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Tipo de conteúdo</Text>
          <Choice options={[{ value: "atividade", label: "Atividade" }, { value: "aviso", label: "Aviso/orientação" }]} value={kind} onChange={setKind} testID="activity-kind" />
          <Text style={styles.label}>Destinado a</Text>
          <Choice options={[{ value: "comunicador", label: "Pessoa comunicadora e rede" }, { value: "rede", label: "Somente rede de apoio" }]} value={audience} onChange={setAudience} testID="activity-audience" />
          <Field label="Título" value={f.title} onChangeText={(v) => setF((p) => ({ ...p, title: v }))} placeholder="Ex.: Atividade de Português" testID="activity-title-input" />
          <Field label="Orientação (será falada)" value={f.instruction} onChangeText={(v) => setF((p) => ({ ...p, instruction: v }))} placeholder="Ex.: Abra o livro na página 25." testID="activity-instruction-input" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {SUGGESTIONS.map((s) => (
              <Pressable key={s.t} onPress={() => setF((p) => ({ ...p, instruction: s.t, emoji: s.e }))} style={styles.sugg} testID={`activity-suggestion-${s.e}`}>
                <Text style={styles.suggText}>
                  {s.e} {s.t}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Field label="Texto curto exibido (opcional)" value={f.display_text} onChangeText={(v) => setF((p) => ({ ...p, display_text: v }))} placeholder="Ex.: ABRIR O LIVRO – PÁGINA 25" testID="activity-display-input" />
          <Text style={styles.label}>Pictograma</Text>
          {!image ? <EmojiPicker value={f.emoji} onChange={(e) => setF((p) => ({ ...p, emoji: e }))} testID="activity-emoji" /> : null}
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            {image ? (
              <View style={styles.visual}>
                <PictoVisual imagePath={image} size={36} />
              </View>
            ) : null}
            <BigButton label={image ? "Trocar imagem" : "Usar imagem da galeria"} icon="image-outline" variant="outline" height={52} onPress={choose} loading={uploading} testID="activity-image-button" style={{ flex: 1 }} />
            {image ? <IconBtn icon="close" label="Remover imagem" onPress={() => setImage(null)} testID="activity-image-remove" /> : null}
          </View>
          {blocked ? <PermissionBlocked text="Acesso às fotos negado. Libere nas configurações do aparelho." testID="activity-permission-blocked" /> : null}
          <BigButton label="Salvar atividade" onPress={save} loading={saving} disabled={uploading} testID="activity-save-button" />
        </KeyboardAwareScrollView>
      </Sheet>
      <ConfirmSheet
        visible={!!del}
        title="Excluir atividade?"
        text={`“${del?.title}” deixará de aparecer para o aluno.`}
        confirmLabel="Excluir"
        onClose={() => setDel(null)}
        onConfirm={async () => {
          const a = del!;
          setDel(null);
          try {
            await api(`/activities/${a.id}`, { method: "DELETE" });
            load();
          } catch (e: any) {
            toast(e.message, "error");
          }
        }}
        testID="delete-activity-confirm"
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  list: { padding: spacing.md, gap: 10 },
  card: { flexDirection: "row", gap: 12, alignItems: "center", padding: spacing.md, borderRadius: radius.lg, borderWidth: 2, borderColor: c.categorySchool, backgroundColor: c.surfaceSecondary },
  visual: { width: 60, height: 60, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  title: { fontFamily: fonts.semibold, fontSize: 14, color: c.muted },
  display: { fontFamily: fonts.extrabold, fontSize: 17, color: c.onSurface },
  meta: { fontFamily: fonts.regular, fontSize: 12, color: c.muted },
  sugg: { height: 44, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, justifyContent: "center", flexShrink: 0 },
  suggText: { fontFamily: fonts.semibold, fontSize: 14, color: c.onSurface },
  label: { fontFamily: fonts.bold, fontSize: 16, color: c.onSurface },
}));
