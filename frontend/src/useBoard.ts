import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { api } from "@/src/api";
import { cacheBoard } from "@/src/offline";
import { useToast } from "@/src/toast";
import { Board } from "@/src/types";

// Admin screens always read fresh data and refresh the offline copy too.
export function useBoard(id: string) {
  const [board, setBoard] = useState<Board | null>(null);
  const toast = useToast();
  const reload = useCallback(async () => {
    try {
      const b = await api<Board>(`/comm-users/${id}/board`);
      setBoard(b);
      cacheBoard(id, b);
    } catch (e: any) {
      toast(e.message, "error");
    }
  }, [id, toast]);
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );
  return { board, reload, setBoard };
}
