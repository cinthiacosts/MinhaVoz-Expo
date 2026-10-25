import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, makeStyles } from "@/src/theme";

type Kind = "success" | "error" | "info";
const Ctx = createContext<(msg: string, kind?: Kind) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: Kind; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  const show = useCallback((msg: string, kind: Kind = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ msg, kind, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 96 }]}>
          <Animated.View
            key={toast.id}
            entering={FadeInDown}
            pointerEvents="none"
            exiting={FadeOutDown}
            style={[styles.toast, toast.kind === "error" ? styles.error : toast.kind === "success" ? styles.success : styles.info]}
            testID="toast-message"
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.text}>{toast.msg}</Text>
          </Animated.View>
        </View>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

const useStyles = makeStyles((c) => ({
  wrap: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  toast: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 16, maxWidth: 520, width: "100%" },
  success: { backgroundColor: c.success },
  error: { backgroundColor: c.error },
  info: { backgroundColor: c.surfaceInverse },
  text: { color: c.onSurfaceInverse, fontFamily: fonts.semibold, fontSize: 16, textAlign: "center" },
}));
