// 음악 번갈아 재생: 틀기 시작한 음악이 claim하면 나머지가 멈춘다 (HOM-04, SND-02, COM-15)
import { describe, expect, it, vi } from 'vitest';
import type { Ctx } from '@core/types';
import { claim, onClaim, player, setPlayer } from './state';

describe('음악 번갈아 재생', () => {
  it('claim은 다른 음악만 멈추고 끈 구독은 부르지 않는다', () => {
    const ctx = {} as Ctx;
    const bgm = vi.fn();
    const shoot = vi.fn();
    onClaim(ctx, 'bgm', bgm);
    const off = onClaim(ctx, 'shoot', shoot);
    claim(ctx, 'bgm');
    expect([bgm.mock.calls.length, shoot.mock.calls.length]).toEqual([0, 1]);
    off();
    claim(ctx, 'playlist');
    expect([bgm.mock.calls.length, shoot.mock.calls.length]).toEqual([1, 1]);
  });

  it('플레이리스트는 재생을 시작할 때만 claim한다', () => {
    const ctx = {} as Ctx;
    const bgm = vi.fn();
    onClaim(ctx, 'bgm', bgm);
    // 다른 음악이 틀면 플레이리스트가 멈춘다 (sound setup과 같은 구독)
    onClaim(ctx, 'playlist', () => player(ctx).playing && setPlayer(ctx, { playing: false }));
    setPlayer(ctx, { playing: true });
    setPlayer(ctx, { playing: true, load: 2 });
    expect(bgm).toHaveBeenCalledTimes(1);
    // 촬영 음악이 틀면 플레이리스트와 배경음악이 멈추고 플레이리스트를 다시 틀면 배경음악이 또 멈춘다
    claim(ctx, 'shoot');
    expect(player(ctx).playing).toBe(false);
    expect(bgm).toHaveBeenCalledTimes(2);
    setPlayer(ctx, { playing: true });
    expect(bgm).toHaveBeenCalledTimes(3);
  });
});
