// Local copy of each board + queue of history events, synced when online.
import { api, ApiError } from "@/src/api";
import { Board } from "@/src/types";
import { storage } from "@/src/utils/storage";

async function privateKey(suffix: string) {
  const raw = await storage.getItem<string | null>("auth_user", null);
  const user = raw ? JSON.parse(raw) : null;
  if (!user?.id) throw new Error("Entre na sua conta para acessar a cópia offline.");
  return `private_${user.id}_${suffix}`;
}
const boardKey = (id: string) => privateKey(`board_v4_${id}`);

export type HistoryEvent = {
  text: string;
  source: "prancha" | "texto" | "frase_rapida" | "escola" | "atividade";
  pictogram_ids?: string[];
  category_keys?: string[];
  session_id?: string | null;
};

type Queued = HistoryEvent & { cid: string; created_at: string };

export async function cacheBoard(id: string, b: Board) {
  await storage.setItem(await boardKey(id), JSON.stringify(b));
}

export async function getCachedBoard(id: string): Promise<Board | null> {
  const s = await storage.getItem<string | null>(await boardKey(id), null);
  return s ? (JSON.parse(s) as Board) : null;
}

export async function loadBoard(id: string): Promise<{ board: Board; offline: boolean }> {
  try {
    const b = await api<Board>(`/comm-users/${id}/board`);
    await cacheBoard(id, b);
    return { board: b, offline: false };
  } catch (e) {
    if (e instanceof ApiError && e.status !== 0) {
      if (e.status === 401 || e.status === 403 || e.status === 404) await storage.removeItem(await boardKey(id));
      throw e;
    }
    const cached = await getCachedBoard(id);
    if (cached) return { board: cached, offline: true };
    throw e;
  }
}

async function readQueue(key: string): Promise<Queued[]> {
  const s = await storage.getItem<string | null>(key, null);
  return s ? JSON.parse(s) : [];
}

export async function queueEvent(cid: string, ev: HistoryEvent) {
  const key = await privateKey("event_queue");
  const q = await readQueue(key);
  q.push({ ...ev, cid, created_at: new Date().toISOString() });
  await storage.setItem(key, JSON.stringify(q.slice(-2000)));
  flushQueue();
}

let flushing = false;
export async function flushQueue() {
  if (flushing) return;
  flushing = true;
  try {
    const key = await privateKey("event_queue");
    const q = await readQueue(key);
    if (!q.length) return;
    const groups: Record<string, Queued[]> = {};
    q.forEach((e) => (groups[e.cid] = [...(groups[e.cid] || []), e]));
    const left: Queued[] = [];
    for (const [cid, evs] of Object.entries(groups)) {
      try {
        await api(`/comm-users/${cid}/events`, {
          method: "POST",
          body: { events: evs.map(({ cid: _c, ...rest }) => rest) },
        });
      } catch (e: any) {
        if (e?.status === 0 || e?.status >= 500 || e?.status === 429) left.push(...evs);
      }
    }
    // Merge with events added while flushing.
    const now = await readQueue(key);
    const sent = new Set(q.map((e) => e.created_at + e.text));
    const extra = now.filter((e) => !sent.has(e.created_at + e.text));
    await storage.setItem(key, JSON.stringify([...left, ...extra]));
  } catch {
    // No signed-in account: leave its private queue untouched.
  } finally {
    flushing = false;
  }
}
