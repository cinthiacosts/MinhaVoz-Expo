import { PendingScreen } from "@/src/navigation-ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import { CommUser, Role, Invitation, ROLE_LABEL } from "@/src/types";
import { AppHeader, BigButton, Choice, ConfirmSheet, Field, IconBtn, Sheet } from "@/src/ui";

type Link = { id: string; role: Role; member_name: string; member_email: string; member_username: string; is_me: boolean };

const GROUPS: { role: Role; label: string; emoji: string }[] = [
  { role: "responsavel", label: "Responsáveis", emoji: "🏠" },
  { role: "cuidador", label: "Cuidadores", emoji: "💛" },
  { role: "professor", label: "Professores", emoji: "🏫" },
  { role: "terapeuta", label: "Terapeutas", emoji: "🩺" },
];

export default function SupportNetwork() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const [cu, setCu] = useState<CommUser | null>(null);
  const [links, setLinks] = useState<Link[] | null>(null);
  const [add, setAdd] = useState(false);
  const [ident, setIdent] = useState("");
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<Link | null>(null);
  const [role, setRole] = useState<Role>("cuidador");
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  const load = useCallback(async () => {
    try {
      const [u, l] = await Promise.all([api<CommUser>(`/comm-users/${id}`), api<Link[]>(`/comm-users/${id}/links`)]);
      setCu(u);
      setLinks(l);
      if (u.my_role === "responsavel") setInvitations(await api<Invitation[]>(`/comm-users/${id}/invitations`));
    } catch (e: any) {
      toast(e.message, "error");
    }
  }, [id, toast]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!cu || !links) return <PendingScreen destination={`/usuario/${id}`} />;
  if (["professor", "cuidador"].includes(cu.my_role)) return (
    <View style={styles.root}>
      <AppHeader title="Meu vínculo" subtitle={cu.name} onBack={() => router.replace(`/usuario/${id}`)} />
      <View style={styles.content}>
        <Text style={styles.name}>Papel: {ROLE_LABEL[cu.my_role]}</Text>
        <Text style={styles.lead}>{cu.my_role === "professor" ? "Seu vínculo permite apoiar a comunicação e administrar conteúdo escolar deste aluno." : "Seu vínculo permite apoiar a comunicação cotidiana e executar rotinas de casa."} A rede de apoio é administrada pelo Responsável.</Text>
      </View>
    </View>
  );
  const canManage = cu.my_role === "responsavel";

  const submit = async () => {
    if (!ident.trim()) return;
    setSaving(true);
    try {
      await api(`/comm-users/${id}/invitations`, { method: "POST", body: { identifier: ident.trim(), role } });
      toast("Convite enviado. O vínculo começa após o aceite na conta da pessoa.", "success");
      setAdd(false);
      setIdent("");
      load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Rede de apoio" subtitle={cu.name} onBack={() => router.replace(`/usuario/${id}`)} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={styles.lead}>Cada integrante usa sua própria conta. Convites pendentes ainda não dão acesso. Registros terapêuticos privados não são compartilhados automaticamente.</Text>
        {canManage && invitations.map((invite) => (
          <View key={invite.id} style={styles.group}>
            <Text style={styles.name}>Convite pendente: {invite.member_name} · {ROLE_LABEL[invite.role]}</Text>
            <Text style={styles.meta}>Aguardando aceite · expira em {new Date(invite.expires_at).toLocaleDateString("pt-BR")}</Text>
            <BigButton label="Cancelar convite" variant="ghost" onPress={async () => {
              try { await api(`/invitations/${invite.id}`, { method: "DELETE" }); load(); }
              catch (e: any) { toast(e.message, "error"); }
            }} testID={`cancel-invite-${invite.id}`} />
          </View>
        ))}
        {GROUPS.map((g) => {
          const members = links.filter((l) => l.role === g.role);
          return (
            <View key={g.role} style={styles.group} testID={`network-group-${g.role}`}>
              <Text style={styles.groupTitle}>
                {g.emoji} {g.label}
              </Text>
              {members.length === 0 ? <Text style={styles.none}>Ninguém vinculado</Text> : null}
              {members.map((m) => (
                <View key={m.id} style={styles.member} testID={`network-member-${m.id}`}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(m.member_name || "?").charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>
                      {m.member_name} {m.is_me ? "(você)" : ""}
                    </Text>
                    {m.member_email ? (
                      <Text style={styles.meta} numberOfLines={1}>
                        @{m.member_username} · {m.member_email}
                      </Text>
                    ) : null}
                  </View>
                  {canManage && !m.is_me ? <IconBtn icon="person-remove-outline" size={44} color={colors.error} label={`Remover ${m.member_name}`} onPress={() => setDel(m)} testID={`network-remove-${m.id}`} /> : null}
                </View>
              ))}
            </View>
          );
        })}
        {canManage ? (
          <BigButton label="Convidar pessoa" icon="person-add-outline" onPress={() => setAdd(true)} testID="network-add-button" />
        ) : (
          <Text style={styles.lead}>Apenas o Responsável pode adicionar ou remover pessoas.</Text>
        )}
      </ScrollView>
      <Sheet visible={add} onClose={() => setAdd(false)} title="Adicionar à rede de apoio" testID="network-add-sheet">
        <View style={{ gap: spacing.md }}>
          <Text style={styles.lead}>Informe uma conta existente e escolha explicitamente sua permissão. A pessoa precisará aceitar no próprio painel. O convite vale por sete dias.</Text>
          <Choice options={GROUPS.map((g) => ({ value: g.role, label: ROLE_LABEL[g.role] }))} value={role} onChange={setRole} testID="invite-role" />
          <Field label="E-mail ou nome de usuário" value={ident} onChangeText={setIdent} autoCapitalize="none" placeholder="ex.: carlos@escola.com" testID="network-identifier-input" autoFocus />
          <BigButton label="Enviar convite" onPress={submit} loading={saving} disabled={!ident.trim()} testID="network-submit-button" />
        </View>
      </Sheet>
      <ConfirmSheet
        visible={!!del}
        title="Remover vínculo?"
        text={`${del?.member_name} deixará de acompanhar ${cu.name}.`}
        confirmLabel="Remover"
        onClose={() => setDel(null)}
        onConfirm={async () => {
          const l = del!;
          setDel(null);
          try {
            await api(`/links/${l.id}`, { method: "DELETE" });
            load();
          } catch (e: any) {
            toast(e.message, "error");
          }
        }}
        testID="network-remove-confirm"
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: spacing.md, gap: spacing.md },
  lead: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: c.muted },
  group: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, gap: 10 },
  groupTitle: { fontFamily: fonts.extrabold, fontSize: 18, color: c.onSurface },
  none: { fontFamily: fonts.regular, fontSize: 15, color: c.muted },
  member: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.extrabold, fontSize: 18, color: c.onSurface },
  name: { fontFamily: fonts.bold, fontSize: 16, color: c.onSurface },
  meta: { fontFamily: fonts.regular, fontSize: 13, color: c.muted },
}));
