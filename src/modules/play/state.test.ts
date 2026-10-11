// 가짜 ctx로 받은 신호의 머리 위 글 순서, 친구 연출 끄기, 날리는 글 줄 수, 누가 했는지 알림, 춤 중 굴리기를 확인한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx, RoomEventMsg, SeatView } from '@core/types';
import { DANCE_MS, DIZZY_MS, FLY_MS, PET_MS, ROLL_MS, ROLL_PAUSE_MS, TELL_GAP_MS, TEXT_MS, TEXT_PER_SENDER } from './logic';
import { DIZZY, HEART, headText, listen, react, rollWait, dance } from './state';

const ME = 'me_pc';
const BOB = 'bob_pc';
const seat = (key: string, uid: string, name: string, self = false): SeatView =>
  ({ key, uid, name, self, state: 'online', look: null, joinedAt: 1, m: {} }) as SeatView;

function fake(opts: { othersFx?: boolean; room?: string | null } = {}) {
  const handlers = new Map<string, (e: RoomEventMsg) => void>();
  const settings = { reactions: true, othersFx: opts.othersFx ?? true };
  const ctx = {
    self: { uid: () => 'me' },
    room: {
      current: () => (opts.room === undefined ? 'ROOM22' : opts.room),
      members: () => [seat(ME, 'me', '나', true), seat(BOB, 'bob', '밥')],
      onEvent: (type: string, fn: (e: RoomEventMsg) => void) => void handlers.set(type, fn),
      emit: vi.fn(() => true),
    },
    settings: { get: () => settings },
    mode: { get: () => 'normal' },
    clock: { now: () => Date.now(), serverNow: () => Date.now() },
    timers: {
      at: (ms: number, fn: () => void) => clearTimeout.bind(null, setTimeout(fn, ms)),
      every: (ms: number, fn: () => void) => clearInterval.bind(null, setInterval(fn, ms)),
    },
    seats: { refresh: () => {} },
    render: { playEffect: vi.fn(() => () => {}) },
    ui: { toast: vi.fn() },
    connection: { online: () => true },
  } as unknown as Ctx;
  listen(ctx);
  let n = 0;
  /** key는 보낸 순서로 커지는 push 키를 흉내 낸다 */
  const fire = (type: string, payload: unknown, uid = 'bob', key = `-K${String(++n).padStart(4, '0')}`) =>
    handlers.get(type)!({ key, uid, at: Date.now(), payload, self: uid === 'me' });
  const effects = () => (ctx.render.playEffect as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1]);
  return { ctx, fire, effects, settings };
}

describe('놀이 받은 신호', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('같은 때에 온 쓰다듬기와 흔들기는 받은 순서와 상관없이 키가 큰 신호가 남는다 (multi-head-order)', () => {
    const a = fake();
    const b = fake();
    // 보낸 순서: 쓰다듬기(K1), 흔들기(K2). 두 PC가 반대 순서로 받는다
    a.fire('pet', { to: BOB }, 'me', '-K1');
    a.fire('shake', { to: BOB }, 'carol', '-K2');
    b.fire('shake', { to: BOB }, 'carol', '-K2');
    b.fire('pet', { to: BOB }, 'me', '-K1');
    expect(headText(a.ctx, BOB)).toBe(DIZZY);
    expect(headText(b.ctx, BOB)).toBe(DIZZY);
    vi.advanceTimersByTime(PET_MS);
    // 앞의 글이 남긴 타이머가 뒤 글을 지우지 않는다
    expect(headText(a.ctx, BOB)).toBe(DIZZY);
    expect(headText(b.ctx, BOB)).toBe(DIZZY);
    vi.advanceTimersByTime(DIZZY_MS - PET_MS);
    expect(headText(a.ctx, BOB)).toBeNull();
    // 앞의 글이 사라진 뒤에는 작은 키도 뜬다
    b.fire('pet', { to: BOB }, 'me', '-K0');
    expect(headText(b.ctx, BOB)).toBe(HEART);
  });

  it('효과가 캐릭터를 데려간 동안 온 반응은 돌아온 뒤에 뜬다 (feedback/F5)', () => {
    const f = fake();
    f.fire('bomb', { from: BOB, to: ME, seed: 1 });
    vi.advanceTimersByTime(1_000);
    f.fire('pet', { to: ME });
    expect(headText(f.ctx, ME)).toBeNull();
    // 폭탄 0.8초 뒤 3.2초 날아간다. 내려온 뒤 뒤에 보낸 쓰다듬기가 어지러움을 덮는다
    vi.advanceTimersByTime(800 + FLY_MS - 1_000 - 1);
    expect(headText(f.ctx, ME)).toBeNull();
    vi.advanceTimersByTime(1);
    expect(headText(f.ctx, ME)).toBe(HEART);
  });

  it('친구 연출을 끄면 날리는 글이 없고 폭탄은 어지러움만, 깜짝쇼는 아무도 날리지 않는다 (D2)', () => {
    const f = fake({ othersFx: false });
    f.fire('text', { key: BOB, text: '안녕', size: 'l', seed: 1 });
    f.fire('bomb', { from: BOB, to: ME, seed: 2 });
    expect(headText(f.ctx, ME)).toBe(DIZZY);
    f.fire('dance', { key: BOB, kind: 80, show: true, seed: 3 });
    vi.advanceTimersByTime(FLY_MS * 2);
    expect(f.effects()).toEqual(['play.dance80']);
    // 내가 보낸 연출은 그대로 보인다
    f.fire('bomb', { from: ME, to: BOB, seed: 4 }, 'me');
    vi.advanceTimersByTime(1_000);
    expect(f.effects()).toEqual(['play.dance80', 'play.bomb', 'play.fly']);
  });

  it('친구 연출을 끄면 친구의 러시안룰렛에서 날아가지 않고 어지러움만 뜬다 (D2)', () => {
    const f = fake({ othersFx: false });
    // 시드 0은 두 주사위가 모두 1이라 날아가는 결과다
    f.fire('roll', { key: BOB, seed: 0 });
    vi.advanceTimersByTime(ROLL_MS + ROLL_PAUSE_MS);
    expect(f.effects()).toEqual([]);
    expect(headText(f.ctx, BOB)).toBe(DIZZY);
    // 내가 굴린 것은 그대로 날아간다
    f.fire('roll', { key: ME, seed: 0 }, 'me');
    vi.advanceTimersByTime(ROLL_MS + ROLL_PAUSE_MS);
    expect(f.effects()).toEqual(['play.fly']);
  });

  it('날리는 글은 보낸 사람마다 5줄까지 흐른다', () => {
    const f = fake();
    for (let i = 0; i < 8; i++) f.fire('text', { key: BOB, text: `글 ${i}`, size: 'm', seed: i });
    f.fire('text', { key: ME, text: '내 글', size: 'm', seed: 9 }, 'me');
    expect(f.effects().filter((e) => e === 'play.text')).toHaveLength(TEXT_PER_SENDER + 1);
    vi.advanceTimersByTime(TEXT_MS);
    f.fire('text', { key: BOB, text: '다시', size: 'm', seed: 10 });
    expect(f.effects().filter((e) => e === 'play.text')).toHaveLength(TEXT_PER_SENDER + 2);
  });

  it('내 캐릭터에 한 장난은 보낸 사람 이름으로 10초에 한 번 알린다', () => {
    const f = fake();
    f.fire('hit', { from: BOB, to: ME, seed: 1 });
    f.fire('pet', { to: ME });
    f.fire('pet', { to: BOB });
    expect(f.ctx.ui.toast).toHaveBeenCalledTimes(1);
    expect(f.ctx.ui.toast).toHaveBeenCalledWith('밥님이 때렸어요');
    vi.advanceTimersByTime(TELL_GAP_MS);
    f.fire('shake', { to: ME });
    expect(f.ctx.ui.toast).toHaveBeenLastCalledWith('밥님이 흔들었어요');
    // 내가 내 캐릭터를 누른 것은 알리지 않는다
    f.fire('pet', { to: ME }, 'me');
    expect(f.ctx.ui.toast).toHaveBeenCalledTimes(2);
  });
});

describe('놀이 보내기', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('춤추는 동안은 굴리지 못한다 (feedback/F4)', () => {
    const f = fake({ room: null });
    expect(rollWait(f.ctx)).toBeNull();
    dance(f.ctx, 80, undefined);
    expect(rollWait(f.ctx)).toBe('춤이 끝나면 굴려 주세요.');
    vi.advanceTimersByTime(DANCE_MS);
    expect(rollWait(f.ctx)).toBeNull();
  });

  it('끊긴 동안 보내지 못하면 끊김 안내를 띄우고 이 PC에서도 띄우지 않는다 (feedback/F2)', () => {
    const f = fake();
    (f.ctx.room.emit as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (f.ctx.connection as { online: () => boolean }).online = () => false;
    react(f.ctx, 'pet', { key: BOB });
    expect(headText(f.ctx, BOB)).toBeNull();
    expect(f.ctx.ui.toast).toHaveBeenCalledWith('연결이 끊겨서 보내지 못했어요. 연결되면 다시 눌러 주세요.');
  });
});
