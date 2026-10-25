import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { fonts, makeStyles, radius, spacing } from "@/src/theme";
import { Sheet } from "@/src/ui";
import { createExitChallenge } from "./exit-policy";

// Protected exit: a simple sum only an adult will solve on purpose.
export function ExitGuard({ visible, onClose, onExit }: { visible: boolean; onClose: () => void; onExit: () => void }) {
  const styles = useStyles();
  const [seed, setSeed] = useState(0);
  const [wrong, setWrong] = useState(false);
  const q = useMemo(() => {
    return createExitChallenge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, visible]);

  useEffect(() => {
    if (visible) setWrong(false);
  }, [visible]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Sair do Modo Comunicação" testID="exit-guard">
      <Text style={styles.text}>Área do adulto responsável. Para sair, responda:</Text>
      <Text style={styles.q} testID="exit-guard-question">
        Quanto é {q.a} + {q.b}?
      </Text>
      <View style={styles.grid}>
        {q.opts.map((n) => (
          <Pressable
            key={n}
            onPress={() => {
              if (n === q.ans) onExit();
              else {
                setWrong(true);
                setSeed((s) => s + 1);
              }
            }}
            style={({ pressed }) => [styles.opt, pressed && { transform: [{ scale: 0.96 }] }]}
            accessibilityRole="button"
            testID={`exit-guard-option-${n}`}
          >
            <Text style={styles.optText}>{n}</Text>
          </Pressable>
        ))}
      </View>
      {wrong ? <Text style={styles.wrong}>Resposta incorreta. Tente novamente.</Text> : null}
      <Pressable onPress={onClose} style={styles.stay} testID="exit-guard-stay-button" accessibilityRole="button">
        <Text style={styles.stayText}>Continuar na prancha</Text>
      </Pressable>
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  text: { fontFamily: fonts.regular, fontSize: 17, color: c.muted },
  q: { fontFamily: fonts.extrabold, fontSize: 34, color: c.onSurface, marginVertical: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  opt: { width: "47%", minHeight: 68, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  optText: { fontFamily: fonts.extrabold, fontSize: 28, color: c.onSurface },
  wrong: { fontFamily: fonts.semibold, fontSize: 16, color: c.error, marginTop: spacing.sm },
  stay: { minHeight: 56, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  stayText: { fontFamily: fonts.bold, fontSize: 17, color: c.brandPrimary },
}));
