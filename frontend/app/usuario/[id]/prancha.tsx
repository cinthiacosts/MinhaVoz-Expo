import { PendingScreen } from "@/src/navigation-ui";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { CATEGORY_COLORS, catColor, fonts, makeStyles, radius, spacing, tint, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import { Category, Pictogram } from "@/src/types";
import { AppHeader, BigButton, ConfirmSheet, EmojiPicker, Field, IconBtn, PictoVisual, Sheet } from "@/src/ui";
import { useBoard } from "@/src/useBoard";

const ALL = "__all";

export default function BoardEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const { board, reload } = useBoard(id);
  const [cat, setCat] = useState(ALL);
  const [q, setQ] = useState("");
  const [del, setDel] = useState<Pictogram | null>(null);
  const [catSheet, setCatSheet] = useState<{ edit?: Category } | null>(null);
  const [cf, setCf] = useState({ name: "", emoji: "⭐", color: "categoryActivities" });
  const [delCat, setDelCat] = useState(false);

  const list = useMemo(() => {
    if (!board) return [];
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    let ps = board.pictograms;
    if (q.trim()) ps = ps.filter((p) => norm(p.name + " " + (p.speech_text || "")).includes(norm(q.trim())));
    else if (cat !== ALL) ps = ps.filter((p) => p.category_key === cat);
    return ps;
  }, [board, cat, q]);

  if (!board) return <PendingScreen destination={`/usuario/${id}`} />;
  if (board.comm_user.my_role === "cuidador") return <Redirect href={`/usuario/${id}/cuidado`} />;
  const catOf = (key: string) => board.categories.find((c) => c.key === key);

  const run = async (fn: () => Promise<any>, ok?: string) => {
    try {
      await fn();
      if (ok) toast(ok, "success");
      await reload();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const openCat = (edit?: Category) => {
    setCf(edit ? { name: edit.name, emoji: edit.emoji, color: edit.color } : { name: "", emoji: "⭐", color: "categoryActivities" });
    setCatSheet({ edit });
  };

  const saveCat = () =>
    run(async () => {
      if (!cf.name.trim()) throw new Error("Informe o nome da categoria");
      if (catSheet?.edit) await api(`/categories/${catSheet.edit.id}`, { method: "PUT", body: cf });
      else await api(`/comm-users/${id}/categories`, { method: "POST", body: cf });
      setCatSheet(null);
    }, "Categoria salva");

  const selectedCat = cat !== ALL ? catOf(cat) : undefined;

  return (
    <View style={styles.root}>
      <AppHeader
        title="Editar prancha"
        subtitle={board.comm_user.name}
        onBack={() => router.replace(`/usuario/${id}`)}
        right={<IconBtn icon="add" label="Adicionar pictograma" bg={colors.brandPrimary} color={colors.onBrandPrimary} onPress={() => router.push(`/usuario/${id}/pictograma${cat !== ALL ? `?cat=${cat}` : ""}` as any)} testID="editor-add-picto-button" />}
      />
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={22} color={colors.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Pesquisar pictograma (ex.: água)" placeholderTextColor={colors.muted} style={styles.search} testID="editor-search-input" accessibilityLabel="Pesquisar pictograma" />
        {q ? <IconBtn icon="close" size={36} label="Limpar pesquisa" onPress={() => setQ("")} testID="editor-search-clear" /> : null}
      </View>
      <View style={styles.chipRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
          {[{ key: ALL, name: "Todos", emoji: "📋", color: "categorySchool" } as any, ...board.categories].map((c) => {
            const on = cat === c.key;
            const accent = catColor(colors, c.color);
            return (
              <Pressable key={c.key} onPress={() => setCat(c.key)} onLongPress={() => c.key !== ALL && openCat(c)} hitSlop={{ top: 10, bottom: 10 }} style={[styles.chip, { borderColor: accent, backgroundColor: on ? accent : tint(accent) }]} testID={`editor-category-${c.key}`}>
                <Text style={{ fontSize: 16 }}>{c.emoji}</Text>
                <Text style={styles.chipText}>{c.name}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => openCat()} style={[styles.chip, styles.chipNew]} testID="editor-new-category-button">
            <Ionicons name="add" size={18} color={colors.onSurface} />
            <Text style={styles.chipText}>Nova categoria</Text>
          </Pressable>
        </ScrollView>
      </View>
      {selectedCat ? (
        <Pressable onPress={() => openCat(selectedCat)} style={styles.catEdit} testID="editor-edit-category-button">
          <Ionicons name="create-outline" size={18} color={colors.brandPrimary} />
          <Text style={styles.catEditText}>Editar categoria “{selectedCat.name}”</Text>
        </Pressable>
      ) : null}
      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.lg }]}
        ListEmptyComponent={<Text style={styles.empty}>Nenhum pictograma encontrado.</Text>}
        renderItem={({ item, index }) => {
          const c = catOf(item.category_key);
          return (
            <View style={styles.row} testID={`editor-picto-row-${item.id}`}>
              <View style={[styles.thumb, { backgroundColor: tint(catColor(colors, c?.color)) }]}>
                <PictoVisual emoji={item.emoji} imagePath={item.image_path} size={30} />
              </View>
              <Pressable style={{ flex: 1 }} onPress={() => router.push(`/usuario/${id}/pictograma?pid=${item.id}` as any)} testID={`editor-picto-edit-${item.id}`} accessibilityRole="button" accessibilityLabel={`Editar ${item.name}`}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {c?.name} · “{item.speech_text || item.name}”
                </Text>
              </Pressable>
              <View style={styles.rowActions}>
                <IconBtn
                  icon={item.favorite ? "star" : "star-outline"}
                  size={40}
                  color={item.favorite ? colors.favorite : colors.muted}
                  label={item.favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                  onPress={() => run(() => api(`/pictograms/${item.id}`, { method: "PUT", body: { favorite: !item.favorite } }))}
                  testID={`editor-picto-fav-${item.id}`}
                />
                {!q && cat !== ALL ? (
                  <>
                    <IconBtn icon="arrow-up" size={40} label="Mover para cima" onPress={() => index > 0 && run(() => api(`/pictograms/${item.id}/move`, { method: "POST", body: { direction: "up" } }))} testID={`editor-picto-up-${item.id}`} />
                    <IconBtn icon="arrow-down" size={40} label="Mover para baixo" onPress={() => run(() => api(`/pictograms/${item.id}/move`, { method: "POST", body: { direction: "down" } }))} testID={`editor-picto-down-${item.id}`} />
                  </>
                ) : null}
                <IconBtn icon="trash-outline" size={40} color={colors.error} label="Excluir" onPress={() => setDel(item)} testID={`editor-picto-delete-${item.id}`} />
              </View>
            </View>
          );
        }}
      />
      <ConfirmSheet
        visible={!!del}
        title="Excluir pictograma?"
        text={`“${del?.name}” será removido da prancha.`}
        confirmLabel="Excluir"
        onClose={() => setDel(null)}
        onConfirm={() => {
          const p = del!;
          setDel(null);
          run(() => api(`/pictograms/${p.id}`, { method: "DELETE" }), "Pictograma excluído");
        }}
        testID="delete-picto-confirm"
      />
      <Sheet visible={!!catSheet} onClose={() => setCatSheet(null)} title={catSheet?.edit ? "Editar categoria" : "Nova categoria"} testID="category-sheet">
        <ScrollView contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <Field label="Nome" value={cf.name} onChangeText={(v) => setCf((p) => ({ ...p, name: v }))} placeholder="Ex.: Família" testID="category-name-input" />
          <Text style={styles.label}>Ícone</Text>
          <EmojiPicker value={cf.emoji} onChange={(e) => setCf((p) => ({ ...p, emoji: e }))} testID="category-emoji" />
          <Text style={styles.label}>Cor</Text>
          <View style={styles.colors}>
            {CATEGORY_COLORS.map((k) => (
              <Pressable key={k} onPress={() => setCf((p) => ({ ...p, color: k }))} style={[styles.color, { backgroundColor: catColor(colors, k) }, cf.color === k && styles.colorOn]} testID={`category-color-${k}`} accessibilityLabel={`Cor ${k}`} />
            ))}
          </View>
          <BigButton label="Salvar categoria" onPress={saveCat} testID="category-save-button" />
          {catSheet?.edit ? <BigButton label="Excluir categoria" variant="ghost" onPress={() => setDelCat(true)} testID="category-delete-button" /> : null}
        </ScrollView>
      </Sheet>
      <ConfirmSheet
        visible={delCat}
        title="Excluir categoria?"
        text="Só é possível excluir categorias vazias."
        confirmLabel="Excluir"
        onClose={() => setDelCat(false)}
        onConfirm={() => {
          const c = catSheet?.edit;
          setDelCat(false);
          setCatSheet(null);
          if (c)
            run(async () => {
              await api(`/categories/${c.id}`, { method: "DELETE" });
              setCat(ALL);
            }, "Categoria excluída");
        }}
        testID="delete-category-confirm"
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: spacing.md, marginTop: spacing.sm, paddingHorizontal: spacing.md, minHeight: 56, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.borderStrong, backgroundColor: c.surfaceSecondary },
  search: { flex: 1, fontFamily: fonts.medium, fontSize: 17, color: c.onSurface, minHeight: 52 },
  chipRow: { height: 56, justifyContent: "center" },
  chipScroll: { gap: 8, paddingHorizontal: spacing.md, alignItems: "center" },
  chip: { height: 36, flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 2 },
  chipNew: { borderColor: c.borderStrong, borderStyle: "dashed", backgroundColor: c.surfaceSecondary },
  chipText: { fontFamily: fonts.bold, fontSize: 14, color: c.onCategory },
  catEdit: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, minHeight: 40 },
  catEditText: { fontFamily: fonts.bold, fontSize: 15, color: c.brandPrimary },
  list: { paddingHorizontal: spacing.md, gap: 8 },
  empty: { fontFamily: fonts.medium, fontSize: 16, color: c.muted, textAlign: "center", padding: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, minHeight: 72 },
  thumb: { width: 54, height: 54, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  rowName: { fontFamily: fonts.bold, fontSize: 17, color: c.onSurface },
  rowMeta: { fontFamily: fonts.regular, fontSize: 13, color: c.muted },
  rowActions: { flexDirection: "row", gap: 4 },
  label: { fontFamily: fonts.bold, fontSize: 16, color: c.onSurface },
  colors: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  color: { width: 48, height: 48, borderRadius: 24, borderWidth: 3, borderColor: "transparent" },
  colorOn: { borderColor: c.onSurface },
}));
