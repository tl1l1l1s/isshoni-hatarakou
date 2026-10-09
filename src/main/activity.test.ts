import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTIVITY_SAMPLE_MS } from '@shared/constants';
import { ActivitySample } from '@shared/schemas';
import { buildSample, lessForeground, startActivity } from './activity';
import { FakePlatform } from './platform/fake';

afterEach(() => vi.useRealTimers());

describe('buildSample', () => {
  it('FakePlatform 값으로 샘플을 만든다', async () => {
    const p = new FakePlatform();
    p.app = 'win:clipstudiopaint.exe';
    p.pens.add('win:clipstudiopaint.exe');
    p.idle = 12;
    const s = await buildSample(p, 1000);
    expect(ActivitySample.parse(s)).toEqual({ at: 1000, appKey: 'win:clipstudiopaint.exe', idleSec: 12, pen: true, unknownReason: null });

    p.app = null;
    p.unknownReason = 'elevated-or-unknown';
    expect(await buildSample(p, 2000)).toEqual({ at: 2000, appKey: null, idleSec: 12, pen: false, unknownReason: 'elevated-or-unknown' });
  });

  it('앞 호출이 끝나지 않았으면 틱을 건너뛴다', async () => {
    vi.useFakeTimers();
    const p = new FakePlatform();
    let release = () => {};
    const calls = vi.fn(() => new Promise<{ appKey: null; unknownReason: string }>((r) => (release = () => r({ appKey: null, unknownReason: 'x' }))));
    p.activeWindow.foreground = calls;
    const sent: ActivitySample[] = [];
    const stop = startActivity(p, (s) => sent.push(s));
    await vi.advanceTimersByTimeAsync(ACTIVITY_SAMPLE_MS * 3);
    expect(calls).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(ACTIVITY_SAMPLE_MS);
    expect(sent).toHaveLength(1);
    expect(calls).toHaveBeenCalledTimes(2);
    stop();
  });
});

describe('lessForeground', () => {
  it('입력이 있으면 매번 묻고 2초 넘게 없으면 5초마다 묻는다. minMs 안에는 묻지 않는다', async () => {
    let t = 0;
    let idle = 0;
    let n = 0;
    const a = lessForeground({ foreground: async () => ({ appKey: null, unknownReason: String(++n) }) }, () => idle, 0, () => t);
    const ask = async (at: number) => ((t = at), (await a.foreground()).unknownReason);
    expect([await ask(1000), await ask(1500)]).toEqual(['1', '2']);
    idle = 2;
    expect([await ask(2000), await ask(6000), await ask(6500)]).toEqual(['2', '2', '3']);
    idle = 0;
    expect(await ask(7000)).toBe('4');

    const mac = lessForeground({ foreground: async () => ({ appKey: null, unknownReason: String(++n) }) }, () => 0, 1500, () => t);
    t = 10_000;
    const first = (await mac.foreground()).unknownReason;
    t = 11_000;
    expect((await mac.foreground()).unknownReason).toBe(first);
    t = 11_500;
    expect((await mac.foreground()).unknownReason).not.toBe(first);
  });
});
