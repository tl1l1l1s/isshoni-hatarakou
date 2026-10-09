// 채팅 알림음 (COM-03). 소리 파일 없이 WebAudio로 짧은 음을 몇 개 이어 낸다. 세 소리는 같은 음량을 쓴다
import type { Chime } from './logic';

/** [주파수 Hz, 시작 초, 길이 초] */
const NOTES: Record<Chime, Array<[number, number, number]>> = {
  '1': [[880, 0, 0.4]],
  '2': [[1047, 0, 0.09], [1568, 0.09, 0.2]],
  '3': [[659, 0, 0.12], [880, 0.12, 0.12], [1319, 0.24, 0.3]],
};
const LEVEL = 0.2;

/** 음이 모두 끝나면 AudioContext를 멈춰 조용할 때 소리 처리를 쉬게 한다 */
export function createChime(): (kind: Chime) => void {
  let ac: AudioContext | null = null;
  let playing = 0;
  return (kind) => {
    const a = (ac ??= new AudioContext());
    void a.resume();
    const t = a.currentTime + 0.02;
    for (const [frequency, at, dur] of NOTES[kind]) {
      const o = new OscillatorNode(a, { type: kind === '2' ? 'triangle' : 'sine', frequency });
      const g = new GainNode(a, { gain: 0 });
      g.gain.setValueAtTime(0, t + at);
      g.gain.linearRampToValueAtTime(LEVEL, t + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + at + dur);
      o.connect(g).connect(a.destination);
      o.onended = () => void (--playing === 0 && a.suspend());
      playing++;
      o.start(t + at);
      o.stop(t + at + dur + 0.05);
    }
  };
}
