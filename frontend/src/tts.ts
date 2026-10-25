// Metro selects native/browser speech. No API key or HTTP TTS.
export { speak, stop, availableVoices, prepareOffline } from "./voice-engine";
export type { VoiceOpts } from "./voice-types";

export function buildSentence(items: { name: string; speech_text?: string }[]) {
  if (!items.length) return "";
  if (items.length === 1 && items[0].speech_text) return items[0].speech_text;
  const raw = items.map((i) => i.name.toLocaleLowerCase("pt-BR")).join(" ");
  const s = raw.charAt(0).toLocaleUpperCase("pt-BR") + raw.slice(1);
  return /[.!?]$/.test(s) ? s : s + ".";
}
export const speechOf = (p: { name: string; speech_text?: string }) => p.speech_text || p.name;
