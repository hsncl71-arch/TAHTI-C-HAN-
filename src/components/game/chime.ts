/** Tiny procedural tones. No audio files. Silent if the browser blocks audio. */
let ctx: AudioContext | null = null;
let last = 0;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

export function chime(kind: "tap" | "war" | "win" | "year" | "coin"): void {
  const nowMs = Date.now();
  if (nowMs - last < 90) return;
  last = nowMs;
  const audio = context();
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume().catch(() => undefined);
  const t = audio.currentTime;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = kind === "war" ? "sawtooth" : kind === "win" ? "triangle" : "sine";
  const freq = kind === "war" ? 196 : kind === "win" ? 523 : kind === "year" ? 330 : kind === "coin" ? 880 : 440;
  o.frequency.setValueAtTime(freq, t);
  if (kind === "win") o.frequency.linearRampToValueAtTime(784, t + 0.18);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(kind === "tap" ? 0.03 : 0.05, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === "win" ? 0.42 : 0.16));
  o.connect(g);
  g.connect(audio.destination);
  o.start(t);
  o.stop(t + 0.46);
}
