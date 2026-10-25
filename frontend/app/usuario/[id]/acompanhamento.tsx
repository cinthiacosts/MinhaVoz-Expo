import { PendingScreen } from "@/src/navigation-ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { api } from "@/src/api";
import { CommUser, Role, ROLE_LABEL, TherapyNote } from "@/src/types";
import { fonts, makeStyles, spacing } from "@/src/theme";
import { useToast } from "@/src/toast";
import { AppHeader, BigButton, Field, Sheet } from "@/src/ui";

const ROLES: Role[] = ["responsavel", "cuidador", "professor", "terapeuta"];

export default function FollowUp() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const styles = useStyles();
  const [cu, setCu] = useState<CommUser | null>(null);
  const [notes, setNotes] = useState<TherapyNote[]>([]);
  const [edit, setEdit] = useState<TherapyNote | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [share, setShare] = useState<TherapyNote | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [profile, rows] = await Promise.all([api<CommUser>(`/comm-users/${id}`), api<TherapyNote[]>(`/comm-users/${id}/therapy-notes`)]);
      setCu(profile); setNotes(rows);
    } catch (e: any) { toast(e.message, "error"); }
  }, [id, toast]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!cu) return <PendingScreen destination={`/usuario/${id}`} />;

  const save = async () => {
    setBusy(true);
    try {
      if (share) {
        await api(`/therapy-notes/${share.id}/sharing`, { method: "PUT", body: { title, text, roles } });
        setShare(null);
      } else if (edit) {
        await api(edit === "new" ? `/comm-users/${id}/therapy-notes` : `/therapy-notes/${edit.id}`,
          { method: edit === "new" ? "POST" : "PUT", body: { title, text } });
        setEdit(null);
      }
      await load();
    } catch (e: any) { toast(e.message, "error"); } finally { setBusy(false); }
  };

  return <View style={styles.root}>
    <AppHeader title="Acompanhamento da comunicação" subtitle={cu.name} onBack={() => router.replace(`/usuario/${id}`)} />
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.body}>Os indicadores gerais de uso são separados destes registros. Registros do terapeuta são privados por padrão; a rede vê somente trechos explicitamente compartilhados.</Text>
      {cu.my_role === "terapeuta" && <BigButton label="Novo registro privado" onPress={() => {
        setTitle(""); setText(""); setEdit("new");
      }} testID="new-private-note" />}
      {!notes.length && <Text style={styles.body}>Nenhum registro disponível para sua conta.</Text>}
      {notes.map((note) => <View style={styles.card} key={note.id} testID={`therapy-note-${note.id}`}>
        <Text style={styles.title}>{note.title}</Text>
        <Text style={styles.body}>{note.text}</Text>
        <Text style={styles.label}>{note.is_author ? "Original privado · somente você" : "Trecho compartilhado pelo terapeuta"}</Text>
        {note.is_author && <>
          <Text style={styles.body}>Compartilhamento: {note.shared?.roles.length ? note.shared.roles.map((r) => ROLE_LABEL[r]).join(", ") : "desativado"}</Text>
          <BigButton label="Editar original privado" variant="outline" onPress={() => {
            setTitle(note.title); setText(note.text); setEdit(note);
          }} testID={`edit-note-${note.id}`} />
          <BigButton label="Escolher trecho e permissões de compartilhamento" variant="outline" onPress={() => {
            setTitle(note.shared?.title ?? ""); setText(note.shared?.text ?? "");
            setRoles(note.shared?.roles ?? []); setShare(note);
          }} testID={`share-note-${note.id}`} />
          {!!note.shared?.roles.length && <BigButton label="Revogar compartilhamento" variant="ghost" onPress={async () => {
            try { await api(`/therapy-notes/${note.id}/sharing`, { method: "PUT", body: { roles: [] } }); await load(); }
            catch (e: any) { toast(e.message, "error"); }
          }} testID={`unshare-note-${note.id}`} />}
        </>}
      </View>)}
    </ScrollView>
    <Sheet visible={!!edit || !!share} onClose={() => { if (!busy) { setEdit(null); setShare(null); } }}
      title={share ? "Compartilhar somente este trecho" : "Registro privado do terapeuta"} testID="therapy-note-sheet">
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.body}>{share ? "Escreva somente o conteúdo que deseja autorizar. Integrantes com os papéis selecionados, inclusive os vinculados depois, poderão ver este trecho enquanto a autorização estiver ativa. Revogue quando necessário." : "Este conteúdo não aparece para outros integrantes nem no Modo Comunicação. Editar o original não publica nem atualiza o trecho compartilhado."}</Text>
        <Field label="Título" value={title} onChangeText={setTitle} maxLength={120} testID="note-title" />
        <Field label={share ? "Trecho a compartilhar" : "Avaliação/observação relacionada à comunicação"} value={text} onChangeText={setText} multiline maxLength={share ? 5000 : 10000} testID="note-text" />
        {share && ROLES.map((role) => <View key={role} style={styles.row}>
          <Text style={styles.body}>{ROLE_LABEL[role]}</Text>
          <Switch value={roles.includes(role)} onValueChange={(on) => setRoles((prev) => on ? [...prev, role] : prev.filter((r) => r !== role))} testID={`share-role-${role}`} />
        </View>)}
        <BigButton label={share ? "Autorizar compartilhamento do trecho" : "Salvar registro privado"} onPress={save} loading={busy}
          disabled={!title.trim() || !text.trim() || (!!share && !roles.length)} testID="save-note" />
      </ScrollView>
    </Sheet>
  </View>;
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.md, paddingBottom: 48, gap: spacing.md },
  card: { padding: spacing.md, gap: 12, borderWidth: 1, borderColor: c.border, borderRadius: 16 },
  title: { fontFamily: fonts.bold, color: c.onSurface, fontSize: 20 },
  body: { fontFamily: fonts.regular, color: c.onSurface, fontSize: 16 },
  label: { fontFamily: fonts.bold, color: c.muted, fontSize: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
}));
