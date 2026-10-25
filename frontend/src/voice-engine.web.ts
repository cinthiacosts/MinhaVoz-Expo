import type { LocalVoice, VoiceOpts } from "./voice-types";

let sequence = 0;
let settlePending: (() => void) | null = null;
function engine() {
  if (typeof window === "undefined" || !("speechSynthesis" in window))
    throw new Error("Este navegador não oferece síntese de voz. Use um navegador compatível.");
  return window.speechSynthesis;
}
async function voices() {
  const synth = engine();
  if (!synth.getVoices().length) await new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); synth.removeEventListener("voiceschanged", done); resolve(); };
    const timer = setTimeout(done, 1500);
    synth.addEventListener("voiceschanged", done);
  });
  return synth.getVoices().filter((v) => v.localService && /^pt([-_]|$)/i.test(v.lang));
}
export async function availableVoices(): Promise<LocalVoice[]> {
  return (await voices()).map((v) => ({ value: v.voiceURI, label: `${v.name} (${v.lang})` }));
}
export function stop() {
  sequence++;
  settlePending?.();
  settlePending = null;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
export async function speak(text: string, o: VoiceOpts): Promise<void> {
  if (!text.trim()) return;
  stop();
  const current = sequence;
  const all = await voices();
  if (current !== sequence) return;
  const voice = all.find((v) => v.voiceURI === o.voice) ?? all.find((v) => /^pt-BR$/i.test(v.lang)) ?? all[0];
  if (!voice) throw new Error("Instale uma voz local de português no sistema e reabra o navegador.");
  const utterance = new SpeechSynthesisUtterance(text.trim());
  utterance.lang = voice.lang; utterance.voice = voice; utterance.rate = o.speed; utterance.volume = o.volume;
  return new Promise((resolve, reject) => {
    const finish = () => { if (settlePending === finish) settlePending = null; resolve(); };
    settlePending = finish;
    utterance.onend = finish;
    utterance.onerror = (event) => {
      if (event.error === "canceled" || event.error === "interrupted") finish();
      else { if (settlePending === finish) settlePending = null; reject(new Error("Não foi possível reproduzir a voz local: " + event.error)); }
    };
    engine().speak(utterance);
  });
}
export async function prepareOffline(texts: string[], _o: VoiceOpts, progress: (done: number, total: number) => void) {
  if (!(await voices()).length) throw new Error("Instale uma voz local de português no sistema.");
  const total = new Set(texts.filter((t) => t.trim())).size;
  progress(total, total); return { total, failed: 0 };
}
