// 백색소음 합성 (SND-08). 소리 파일 없이 WebAudio로 걸러 낸 잡음과 짧은 딸깍 소리를 만든다
import type { Ctx, Dispose } from '@core/types';
import { FADE_OUT_SEC, fadeSec, type Kind } from './logic';

interface Voice { out: GainNode; want: number; tick?: (t: number) => void; stop: () => void }

/** 돌려준 함수에 종류별 음량을 주면 그 음량으로 천천히 바꾸고 0이 된 소리는 줄어든 뒤 멈춘다 */
export function createNoise(ctx: Ctx): (gains: Map<Kind, number>) => void {
  let ac: AudioContext | null = null;
  let buf: AudioBuffer | null = null;
  const voices = new Map<Kind, Voice>();
  let ticker: Dispose | null = null;

  const audio = () => {
    if (ac && buf) return { a: ac, b: buf };
    const a = (ac = new AudioContext());
    const b = (buf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate));
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return { a, b };
  };

  const make = (k: Kind): Voice => {
    const { a, b } = audio();
    const out = new GainNode(a, { gain: 0 });
    out.connect(a.destination);
    const sources: AudioScheduledSourceNode[] = [];
    const gain = (v: number) => new GainNode(a, { gain: v });
    const filter = (type: BiquadFilterType, frequency: number, Q = 1) => new BiquadFilterNode(a, { type, frequency, Q });
    const chain = (...nodes: AudioNode[]) => nodes.reduce((p, n) => p.connect(n));
    const loop = (...fx: AudioNode[]) => {
      const s = new AudioBufferSourceNode(a, { buffer: b, loop: true });
      chain(s, ...fx, out);
      s.start();
      sources.push(s);
    };
    /** 잡음을 dur초만 띄워 band 근처만 남긴 짧은 소리 */
    const burst = (t: number, band: number, dur: number, level: number) => {
      const s = new AudioBufferSourceNode(a, { buffer: b });
      const env = gain(level);
      env.gain.setValueAtTime(level, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + dur);
      chain(s, filter('bandpass', band, 2), env, out);
      s.start(t, Math.random() * 1.5, dur);
    };
    const r = Math.random;
    let tick: Voice['tick'];
    if (k === 'rain') loop(filter('highpass', 400), filter('lowpass', 6000), gain(0.5));
    if (k === 'keys') tick = (t) => r() < 0.6 && burst(t + r() * 0.1, 1500 + r() * 2500, 0.03, 0.9);
    if (k === 'fire') {
      loop(filter('lowpass', 300), gain(0.8));
      tick = (t) => r() < 0.35 && burst(t + r() * 0.1, 2500 + r() * 4000, 0.008 + r() * 0.02, 0.2 + r() * 0.8);
    }
    if (k === 'cafe') {
      // 웅성거림은 말소리 대역의 잡음을 느리게 키웠다 줄인다
      const murmur = gain(0.5);
      const lfo = new OscillatorNode(a, { frequency: 0.3 });
      chain(lfo, gain(0.25)).connect(murmur.gain);
      lfo.start();
      sources.push(lfo);
      loop(filter('bandpass', 500, 0.6), filter('lowpass', 1500), murmur);
      tick = (t) => {
        if (r() > 0.004) return;
        const o = new OscillatorNode(a, { frequency: 2500 + r() * 1500 });
        const env = gain(0.15);
        env.gain.setValueAtTime(0.15, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        chain(o, env, out);
        o.start(t);
        o.stop(t + 0.4);
      };
    }
    const stop = () => {
      sources.forEach((s) => s.stop());
      out.disconnect();
    };
    return { out, want: 0, tick, stop };
  };

  return (gains) => {
    // 음량이 모두 0이면 소리를 만들지 않으므로 AudioContext를 깨우지 않는다
    const on = [...gains.values()].some((v) => v > 0);
    if (!ac && !on) return;
    const { a } = audio();
    if (on) void a.resume();
    const t = a.currentTime;
    for (const k of new Set([...voices.keys(), ...gains.keys()])) {
      const want = gains.get(k) ?? 0;
      let v = voices.get(k);
      if (!v) {
        if (want === 0) continue;
        voices.set(k, (v = make(k)));
      }
      const g = v.out.gain;
      const from = g.value;
      g.cancelScheduledValues(t);
      g.setValueAtTime(from, t);
      g.linearRampToValueAtTime(want, t + fadeSec(from, want));
      v.want = want;
      if (want > 0) continue;
      const done = v;
      ctx.timers.at(FADE_OUT_SEC * 1000 + 100, () => {
        if (done.want > 0 || voices.get(k) !== done) return;
        done.stop();
        voices.delete(k);
        if (voices.size > 0) return;
        ticker?.();
        ticker = null;
        void a.suspend();
      });
    }
    if (voices.size > 0) ticker ??= ctx.timers.every(100, () => voices.forEach((v) => v.tick?.(a.currentTime)));
    else void a.suspend();
  };
}
