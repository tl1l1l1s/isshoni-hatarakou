// 촬영 배경음악 (COM-15). 소리 파일 없이 WebAudio로 4초짜리 짧은 곡을 되풀이한다
import type { Ctx, Dispose } from '@core/types';

const STEP = 0.25;
/** 8분음표마다 멜로디 (MIDI 번호, 0은 쉼) */
const MELODY = [72, 76, 79, 76, 74, 77, 81, 0, 72, 76, 79, 84, 81, 79, 77, 0];
/** 4박마다 베이스 */
const BASS = [48, 53, 55, 48];
const LEVEL = 0.12;

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** 재생을 시작하고 멈추는 함수를 돌려준다. 1초 앞까지 음을 미리 걸어 둔다 */
export function playMusic(ctx: Ctx): Dispose {
  let ac: AudioContext;
  try {
    ac = new AudioContext();
  } catch (e) {
    ctx.log.warn(`촬영 음악을 켜지 못했어요: ${(e as Error).message}`);
    return () => {};
  }
  const out = new GainNode(ac, { gain: LEVEL });
  out.connect(ac.destination);
  const note = (midi: number, at: number, dur: number, type: OscillatorType, level: number) => {
    const o = new OscillatorNode(ac, { type, frequency: hz(midi) });
    const g = new GainNode(ac, { gain: 0 });
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + dur + 0.05);
  };
  let next = ac.currentTime + 0.05;
  let step = 0;
  const fill = () => {
    while (next < ac.currentTime + 1) {
      const m = MELODY[step % MELODY.length]!;
      if (m) note(m, next, STEP * 0.9, 'triangle', 1);
      if (step % 4 === 0) note(BASS[(step / 4) % BASS.length]!, next, STEP * 3, 'sine', 0.8);
      next += STEP;
      step++;
    }
  };
  void ac.resume();
  fill();
  const stop = ctx.timers.every(250, fill);
  return () => {
    stop();
    out.gain.setTargetAtTime(0, ac.currentTime, 0.05);
    ctx.timers.at(300, () => void ac.close());
  };
}
