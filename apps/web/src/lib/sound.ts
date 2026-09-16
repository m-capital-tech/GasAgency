/** Two-tone "new order" chime generated with the Web Audio API — no asset files needed. */
let ctx: AudioContext | null = null;
export function playNewOrderChime() {
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    [[880, 0], [1174.7, 0.12]].forEach(([freq, offset]) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.35);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.4);
    });
  } catch {
    /* autoplay policies may block until first interaction */
  }
}
