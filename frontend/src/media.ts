import * as ImagePicker from "expo-image-picker";

import { API, getToken } from "@/src/api";
import { uploadForm } from "@/src/utils/upload";

export type PickResult = { status: "ok"; asset: ImagePicker.ImagePickerAsset } | { status: "cancel" } | { status: "blocked" } | { status: "denied" };

// Gallery access following the permission contract: check, ask once more if allowed,
// otherwise report "blocked" so the screen can offer "Abrir configurações".
export async function pickImage(): Promise<PickResult> {
  let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    if (!perm.canAskAgain) return { status: "blocked" };
    perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return { status: perm.canAskAgain ? "denied" : "blocked" };
  }
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.6 });
  if (r.canceled || !r.assets?.length) return { status: "cancel" };
  return { status: "ok", asset: r.assets[0] };
}

export async function uploadImage(asset: ImagePicker.ImagePickerAsset, commUserId?: string): Promise<string> {
  const res = await uploadForm(`${API}/upload`, {
    headers: { Authorization: `Bearer ${getToken()}` },
    fields: commUserId ? { comm_user_id: commUserId } : {},
    files: { file: { uri: asset.uri, name: asset.fileName ?? "foto.jpg", mimeType: asset.mimeType ?? "image/jpeg" } },
  });
  if (!res.ok) {
    let msg = "Não foi possível enviar a imagem";
    try {
      const d = await res.json();
      if (typeof d?.detail === "string") msg = d.detail;
    } catch {
      // plain-text error body
    }
    throw new Error(msg);
  }
  const d = await res.json();
  return d.path as string;
}
