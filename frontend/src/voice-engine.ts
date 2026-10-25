import * as Speech from "expo-speech";
import type { LocalVoice, VoiceOpts } from "./voice-types";

let sequence = 0;
export async function availableVoices(): Promise<LocalVoice[]> {
  const voices = await Speech.getAvailableVoicesAsync();
  return voices.filter((v) => /^pt([-_]|$)/i.test(v.language) && !/network|online/i.test(v.identifier))
    .sort((a, b) => Number(/local/i.test(b.identifier)) - Number(/local/i.test(a.identifier)))
    .map((v) => ({ value: v.identifier, label: `${v.name} (${v.language})` }));
}
export function stop() { sequence++; void Speech.stop(); }
export async function speak(text: string, o: VoiceOpts): Promise<void> {
  if (!text.trim()) return;
  const current = ++sequence;
  await Speech.stop();
  const voices = await availableVoices();
  if (current !== sequence) return;
  const voice = voices.find((v) => v.value === o.voice) ?? voices[0];
  if (!voice) throw new Error("Instale uma voz de português offline nas configurações de síntese de voz do aparelho.");
  return new Promise((resolve, reject) => Speech.speak(text.trim(), {
    language: "pt-BR", voice: voice.value, rate: o.speed, volume: o.volume,
    onDone: resolve, onStopped: resolve, onError: reject,
  }));
}
export async function prepareOffline(texts: string[], _o: VoiceOpts, progress: (done: number, total: number) => void) {
  if (!(await availableVoices()).length) throw new Error("Instale uma voz de português offline nas configurações do aparelho.");
  const total = new Set(texts.filter((t) => t.trim())).size;
  progress(total, total);
  return { total, failed: 0 };
}
