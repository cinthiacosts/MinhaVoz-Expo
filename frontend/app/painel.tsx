import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";
import { PROFILE_CREATE, CommUser, Invitation, ROLE_LABEL } from "@/src/types";
import { AppHeader, BigButton, ConfirmSheet, EmptyState, IconBtn, Loading, PictoVisual } from "@/src/ui";

export const LIST_TITLE: Record<string, string> = {
  responsavel: "Usuários",
  cuidador: "Usuários",
  professor: "Meus alunos",
  terapeuta: "Meus pacientes",
};

export default function Panel() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const [items, setItems] = useState<CommUser[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [askLogout, setAskLogout] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  const load = useCallback(async () => {
    try {
      setItems(await api<CommUser[]>("/comm-users"));
      setInvitations(await api<Invitation[]>("/invitations"));
    } catch (e: any) {
      toast(e.message, "error");
      setItems((p) => p ?? []);
    }
  }, [toast]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!user) return <Redirect href="/" />;
  if (!user.role) return <Redirect href="/perfil" />;
  const canCreate = PROFILE_CREATE.includes(user.role);

  return (
    <View style={styles.root}>
      <AppHeader
        title={`Olá, ${user.full_name.split(" ")[0]}`}
        subtitle={`Perfil: ${ROLE_LABEL[user.role]}`}
        testID="panel-header"
        right={
          <View style={{ flexDirection: "row", gap: 8 }}>
            <IconBtn icon="swap-horizontal" label="Trocar tipo de perfil" onPress={() => router.push("/perfil")} testID="panel-change-role-button" />
            <IconBtn icon="log-out-outline" label="Sair da conta" onPress={() => setAskLogout(true)} testID="panel-logout-button" />
          </View>
        }
      />
      {items === null ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + (canCreate ? 110 : spacing.lg) }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          ListHeaderComponent={<View style={{ gap: 12 }}>
            {invitations.map((invite) => <View key={invite.id} style={styles.card}>
              <Text style={styles.name}>Convite para acompanhar {invite.comm_user_name}</Text>
              <Text style={styles.meta}>Permissão: {ROLE_LABEL[invite.role]}. Aceitar permite acesso ao perfil e ao conteúdo compartilhado, conforme esse papel.</Text>
              <BigButton label="Aceitar convite" onPress={async () => {
                try { await api(`/invitations/${invite.id}/accept`, { method: "POST" }); await load(); }
                catch (e: any) { toast(e.message, "error"); }
              }} testID={`accept-invite-${invite.id}`} />
              <BigButton label="Recusar" variant="ghost" onPress={async () => {
                try { await api(`/invitations/${invite.id}/decline`, { method: "POST" }); await load(); }
                catch (e: any) { toast(e.message, "error"); }
              }} testID={`decline-invite-${invite.id}`} />
            </View>)}
            <Text style={styles.title} accessibilityRole="header">{LIST_TITLE[user.role]}</Text>
          </View>}
          ListEmptyComponent={
            canCreate ? (
              <EmptyState emoji="🧑‍🤝‍🧑" title="Nenhum usuário cadastrado" text="Cadastre a pessoa que vai usar a prancha para começar." testID="panel-empty" />
            ) : (
              <EmptyState
                emoji="🔗"
                title="Nenhum vínculo ainda"
                text={`Peça ao responsável para adicionar você na Rede de Apoio usando seu e-mail (${user.email}) ou usuário (@${user.username}).`}
                testID="panel-empty"
              />
            )
          }
          renderItem={({ item }) => (
            <View style={styles.card} testID={`comm-user-card-${item.id}`}>
              <Pressable
                onPress={() => router.push(`/usuario/${item.id}`)}
                style={({ pressed }) => [styles.cardMain, pressed && { opacity: 0.85 }]}
                accessibilityRole="button"
                accessibilityLabel={`Abrir painel de ${item.name}`}
                testID={`comm-user-open-${item.id}`}
              >
                <View style={styles.avatar}>
                  {item.photo_path ? <PictoVisual imagePath={item.photo_path} size={40} /> : <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>Você: {ROLE_LABEL[item.my_role]}</Text>
                </View>
                <Ionicons name="chevron-forward" size={26} color={colors.muted} />
              </Pressable>
              <BigButton
                label="Modo Comunicação"
                icon="chatbubbles-outline"
                variant="secondary"
                height={56}
                onPress={() => router.push(`/comunicacao/${item.id}`)}
                testID={`comm-user-communicate-${item.id}`}
              />
            </View>
          )}
        />
      )}
      {canCreate ? (
        <View style={[styles.fab, { bottom: insets.bottom + spacing.md }]}>
          <BigButton label="Cadastrar usuário" icon="add" onPress={() => router.push("/usuario/form")} testID="panel-add-comm-user-button" />
        </View>
      ) : null}
      <ConfirmSheet
        visible={askLogout}
        title="Sair da conta?"
        text="Você precisará entrar novamente com e-mail e senha."
        confirmLabel="Sair"
        onClose={() => setAskLogout(false)}
        onConfirm={async () => {
          setAskLogout(false);
          await logout();
          router.replace("/");
        }}
        testID="logout-confirm"
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  list: { padding: spacing.md, gap: spacing.md },
  title: { fontFamily: fonts.extrabold, fontSize: 28, color: c.onSurface, marginBottom: 4 },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.md, gap: spacing.sm },
  cardMain: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarText: { fontFamily: fonts.extrabold, fontSize: 26, color: c.onBrandTertiary },
  name: { fontFamily: fonts.extrabold, fontSize: 22, color: c.onSurface },
  meta: { fontFamily: fonts.medium, fontSize: 15, color: c.muted },
  fab: { position: "absolute", left: spacing.md, right: spacing.md },
}));
