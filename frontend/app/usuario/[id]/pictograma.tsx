import { PendingScreen } from "@/src/navigation-ui";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { pickImage, uploadImage } from "@/src/media";
import { catColor, fonts, makeStyles, radius, spacing, tint, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import { speak } from "@/src/tts";
import { AppHeader, BigButton, EmojiPicker, Field, PermissionBlocked, PictoVisual } from "@/src/ui";
import { useBoard } from "@/src/useBoard";

export default function PictogramForm() {
  const { id, pid, cat } = useLocalSearchParams<{ id: string; pid?: string; cat?: string }>();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const { board } = useBoard(id);
  const [f, setF] = useState({ name: "", speech_text: "", emoji: "⭐", category_key: cat || "pessoas", favorite: false });
  const [image, setImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [inited, setInited] = useState(!pid);

  useEffect(() => {
    if (!board || inited) return;
    const p = board.pictograms.find((x) => x.id === pid);
    if (p) {
      setF({ name: p.name, speech_text: p.speech_text || "", emoji: p.emoji || "⭐", category_key: p.category_key, favorite: p.favorite });
      setImage(p.image_path || null);
    }
    setInited(true);
  }, [board, pid, inited]);

  if (!board || !inited) return <PendingScreen destination={`/usuario/${id}`} />;
  if (board.comm_user.my_role === "cuidador") return <Redirect href={`/usuario/${id}/cuidado`} />;

  const choose = async () => {
    const r = await pickImage();
    if (r.status === "blocked") return setBlocked(true);
    if (r.status === "denied") return toast("Sem acesso à galeria. Você pode tentar de novo quando quiser.", "info");
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
    if (!f.name.trim()) return toast("Informe o nome do pictograma", "error");
    setSaving(true);
    try {
      const body = { ...f, name: f.name.trim(), speech_text: f.speech_text.trim(), image_path: image };
      if (pid) await api(`/pictograms/${pid}`, { method: "PUT", body });
      else await api(`/comm-users/${id}/pictograms`, { method: "POST", body });
      toast("Pictograma salvo na prancha", "success");
      router.replace(`/usuario/${id}`);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    try {
      const s = board.settings;
      await speak(f.speech_text || f.name, { voice: s.voice, speed: s.speech_rate, volume: s.volume });
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const accent = catColor(colors, board.categories.find((c) => c.key === f.category_key)?.color);

  return (
    <View style={styles.root}>
      <AppHeader title={pid ? "Editar pictograma" : "Adicionar pictograma"} subtitle={board.comm_user.name} onBack={() => router.replace(`/usuario/${id}`)} />
      <KeyboardAwareScrollView bottomOffset={100} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.previewRow}>
          <Pressable onPress={choose} style={[styles.preview, { borderColor: accent, backgroundColor: tint(accent) }]} testID="picto-image-button" accessibilityRole="button" accessibilityLabel="Escolher imagem da galeria">
            <PictoVisual emoji={f.emoji} imagePath={image} size={56} />
            <Text style={styles.previewName} numberOfLines={1}>
              {(f.name || "NOME").toLocaleUpperCase("pt-BR")}
            </Text>
          </Pressable>
          <View style={{ flex: 1, gap: 8 }}>
            <BigButton label={uploading ? "Enviando..." : image ? "Trocar foto" : "Foto da galeria"} icon="image-outline" variant="outline" height={56} onPress={choose} loading={uploading} testID="picto-pick-photo-button" />
            {image ? <BigButton label="Usar ícone" variant="ghost" height={48} onPress={() => setImage(null)} testID="picto-remove-photo-button" /> : null}
            <Text style={styles.hint}>Use fotos reais: a mãe, a escola, o brinquedo preferido...</Text>
          </View>
        </View>
        {blocked ? <PermissionBlocked text="O acesso às fotos foi negado. Libere nas configurações do aparelho para usar fotos reais." testID="picto-permission-blocked" /> : null}
        {!image ? (
          <>
            <Text style={styles.label}>Ícone</Text>
            <EmojiPicker value={f.emoji} onChange={(e) => setF((p) => ({ ...p, emoji: e }))} testID="picto-emoji" />
          </>
        ) : null}
        <Field label="Nome" value={f.name} onChangeText={(v) => setF((p) => ({ ...p, name: v }))} placeholder="Ex.: Vovó" testID="picto-name-input" />
        <Field
          label="Texto que será falado"
          value={f.speech_text}
          onChangeText={(v) => setF((p) => ({ ...p, speech_text: v }))}
          placeholder="Ex.: Quero falar com a vovó. (vazio = fala o nome)"
          testID="picto-speech-input"
        />
        <Text style={styles.label}>Categoria</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {board.categories.map((c) => {
            const on = f.category_key === c.key;
            const a = catColor(colors, c.color);
            return (
              <Pressable key={c.key} onPress={() => setF((p) => ({ ...p, category_key: c.key }))} style={[styles.chip, { borderColor: a, backgroundColor: on ? a : tint(a) }]} testID={`picto-category-${c.key}`} accessibilityState={{ selected: on }}>
                <Text style={{ fontSize: 16 }}>{c.emoji}</Text>
                <Text style={styles.chipText}>{c.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.switchRow}>
          <Text style={styles.label}>⭐ Adicionar aos favoritos</Text>
          <Switch value={f.favorite} onValueChange={(v) => setF((p) => ({ ...p, favorite: v }))} testID="picto-favorite-switch" trackColor={{ true: colors.success, false: colors.borderStrong }} />
        </View>
        <BigButton label="Ouvir como vai falar" icon="volume-high-outline" variant="ghost" onPress={test} disabled={!f.name.trim()} testID="picto-test-voice-button" />
      </KeyboardAwareScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <BigButton label="SALVAR" onPress={save} loading={saving} disabled={uploading} testID="picto-save-button" />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  previewRow: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  preview: { width: 130, height: 140, borderRadius: radius.md, borderWidth: 2, alignItems: "center", justifyContent: "center", gap: 6, padding: 6, overflow: "hidden" },
  previewName: { fontFamily: fonts.extrabold, fontSize: 15, color: c.onSurface },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: c.muted },
  label: { fontFamily: fonts.bold, fontSize: 16, color: c.onSurface },
  chip: { height: 44, flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 2 },
  chipText: { fontFamily: fonts.bold, fontSize: 14, color: c.onCategory },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 56 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
}));
