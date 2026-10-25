import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { pickImage, uploadImage } from "@/src/media";
import { fonts, makeStyles, radius, spacing } from "@/src/theme";
import { useToast } from "@/src/toast";
import { CommUser, PROFILE_CREATE } from "@/src/types";
import { useVerifiedProfile } from "@/src/profile-access";
import { PendingScreen } from "@/src/navigation-ui";
import { AppHeader, BigButton, Field, Loading, PermissionBlocked, PictoVisual } from "@/src/ui";

export default function CommUserForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const { access, failed } = useVerifiedProfile(id, "form");
  if (!id && (!user?.role || !PROFILE_CREATE.includes(user.role))) return <Redirect href="/painel" />;
  if (id) {
    if (failed) return <Redirect href="/painel" />;
    if (!access) return <PendingScreen destination={`/usuario/${id}`} />;
    if (access.profile.my_role !== "responsavel") return <Redirect href={`/usuario/${id}`} />;
  }
  return <VerifiedCommUserForm key={`${user?.id}:${id ?? "new"}`} />;
}

function VerifiedCommUserForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const [f, setF] = useState({ name: "", birth_date: "", preferences: "", notes: "" });
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [created, setCreated] = useState<CommUser | null>(null);
  const [responsibilityConfirmed, setResponsibilityConfirmed] = useState(false);
  const [forbiddenEdit, setForbiddenEdit] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!id) return;
    api<CommUser>(`/comm-users/${id}`)
      .then((u) => {
        if (u.my_role === "cuidador") { setForbiddenEdit(true); return; }
        setF({ name: u.name, birth_date: u.birth_date || "", preferences: u.preferences || "", notes: u.notes || "" });
        setPhoto(u.photo_path || null);
      })
      .catch((e) => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [id, toast]);

  const choosePhoto = async () => {
    const r = await pickImage();
    if (r.status === "blocked") return setBlocked(true);
    if (r.status === "denied") return toast("Sem acesso à galeria. Você pode tentar novamente.", "info");
    if (r.status !== "ok") return;
    setUploading(true);
    try {
      setPhoto(await uploadImage(r.asset, id));
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setUploading(false);
    }
  };

  const maskDate = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 8);
    return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join("/");
  };

  const save = async () => {
    if (!f.name.trim()) return toast("Informe o nome", "error");
    if (!id && user?.role === "cuidador" && !responsibilityConfirmed) return toast("Confirme sua responsabilidade por este novo perfil", "error");
    setSaving(true);
    try {
      const body = { ...f, name: f.name.trim(), photo_path: photo };
      if (id) {
        await api(`/comm-users/${id}`, { method: "PUT", body });
        toast("Dados atualizados", "success");
        router.replace(id ? `/usuario/${id}` : "/painel");
      } else {
        setCreated(await api<CommUser>("/comm-users", { method: "POST", body: { ...body, responsibility_confirmed: responsibilityConfirmed } }));
      }
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  if (forbiddenEdit && id) return <Redirect href={`/usuario/${id}`} />;
  if (created) {
    return (
      <View style={[styles.root, styles.done, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg }]} testID="comm-user-created">
        <View style={{ alignItems: "center", gap: spacing.md }}>
          <Text style={{ fontSize: 72 }}>🎉</Text>
          <Text style={styles.doneTitle}>{created.name} foi cadastrado(a)!</Text>
          <Text style={styles.doneText}>A prancha já vem com pictogramas básicos, frases rápidas e comandos da escola. Você pode personalizar quando quiser.</Text>
        </View>
        <View style={{ gap: 12 }}>
          <BigButton label="Abrir Minha Voz" icon="chatbubbles" height={72} onPress={() => router.replace(`/comunicacao/${created.id}`)} testID="created-open-comm-button" />
          <BigButton label="Ir para o painel do usuário" variant="outline" onPress={() => router.replace(`/usuario/${created.id}`)} testID="created-open-hub-button" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppHeader title={id ? "Editar dados" : "Cadastrar usuário"} subtitle="Pessoa que usará a prancha" onBack={() => router.replace(id ? `/usuario/${id}` : "/painel")} />
      {loading ? (
        <Loading />
      ) : (
        <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]} keyboardShouldPersistTaps="handled">
          <Pressable onPress={choosePhoto} style={styles.photo} accessibilityRole="button" accessibilityLabel="Escolher foto da galeria (opcional)" testID="comm-user-photo-button">
            {photo ? <PictoVisual imagePath={photo} size={70} /> : <Text style={{ fontSize: 44 }}>📷</Text>}
            <Text style={styles.photoText}>{uploading ? "Enviando..." : photo ? "Trocar foto" : "Foto (opcional)"}</Text>
          </Pressable>
          {blocked ? <PermissionBlocked text="O acesso às fotos foi negado. Para usar uma foto, libere o acesso nas configurações do aparelho." testID="photo-permission-blocked" /> : null}
          <Field label="Nome" value={f.name} onChangeText={set("name")} placeholder="Ex.: João" testID="comm-user-name-input" />
          <Field label="Data de nascimento" value={f.birth_date} onChangeText={(v) => set("birth_date")(maskDate(v))} keyboardType="number-pad" placeholder="DD/MM/AAAA" testID="comm-user-birth-input" />
          <Field
            label="Preferências de comunicação"
            value={f.preferences}
            onChangeText={set("preferences")}
            placeholder="Ex.: prefere fotos reais, gosta de dinossauros"
            multiline
            style={{ minHeight: 88, paddingTop: 14, textAlignVertical: "top" }}
            testID="comm-user-preferences-input"
          />
          <Field
            label="Observações para personalização"
            value={f.notes}
            onChangeText={set("notes")}
            placeholder="Ex.: sensível a sons altos"
            multiline
            style={{ minHeight: 88, paddingTop: 14, textAlignVertical: "top" }}
            testID="comm-user-notes-input"
          />
          <Text style={styles.privacy}>Pedimos apenas o necessário para personalizar a comunicação.</Text>
          {!id && user?.role === "cuidador" && <View style={{ gap: 8 }}>
            <Text style={styles.privacy}>Ao criar um novo perfil, você será Responsável somente por ele. Seus vínculos como Cuidador em outros perfis não serão alterados.</Text>
            <Text style={styles.privacy}>Confirmo que tenho responsabilidade ou autorização para cadastrar esta pessoa e administrar este novo perfil.</Text>
            <Switch value={responsibilityConfirmed} onValueChange={setResponsibilityConfirmed} accessibilityLabel="Confirmar responsabilidade pelo novo perfil" testID="confirm-profile-responsibility" />
          </View>}
          <BigButton label={id ? "SALVAR" : "CADASTRAR"} onPress={save} loading={saving} disabled={uploading} testID="comm-user-save-button" />
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.lg, gap: spacing.md },
  photo: {
    alignSelf: "center",
    width: 150,
    height: 150,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: c.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: c.surfaceSecondary,
    overflow: "hidden",
  },
  photoText: { fontFamily: fonts.semibold, fontSize: 14, color: c.muted },
  privacy: { fontFamily: fonts.regular, fontSize: 14, color: c.muted },
  done: { paddingHorizontal: spacing.lg, justifyContent: "space-between" },
  doneTitle: { fontFamily: fonts.extrabold, fontSize: 28, textAlign: "center", color: c.onSurface },
  doneText: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 25, textAlign: "center", color: c.muted },
}));
