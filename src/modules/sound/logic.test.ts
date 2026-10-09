import { describe, expect, it } from 'vitest';
import { fadeSec, fromV1, mix, nextIndex, openPreset, pickSurf, Playlist, playerTitle, playOrder, sharedRatio, youTubeId, type Shared } from './logic';

describe('유튜브 영상 id', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?list=PL1&v=dQw4w9WgXcQ&t=30s', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
    ['youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=3', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['  dQw4w9WgXcQ  ', 'dQw4w9WgXcQ'],
  ])('%s', (url, id) => expect(youTubeId(url)).toBe(id));

  it.each([
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/playlist?list=PL1',
    'https://www.youtube.com/@channel',
    '노래 제목',
    '',
  ])('%s는 받지 않는다', (url) => expect(youTubeId(url)).toBeNull());
});

describe('재생 순서', () => {
  const plain = playOrder(4, false, 1);

  it('셔플을 끄면 목록 순서', () => expect(plain).toEqual([0, 1, 2, 3]));

  it('다음 곡과 이전 곡, 끝에서는 반복일 때만 처음으로', () => {
    expect(nextIndex(plain, 1, 1, false)).toBe(2);
    expect(nextIndex(plain, 1, -1, false)).toBe(0);
    expect(nextIndex(plain, 3, 1, false)).toBeNull();
    expect(nextIndex(plain, 3, 1, true)).toBe(0);
    expect(nextIndex(plain, 0, -1, true)).toBe(3);
    expect(nextIndex(plain, 0, -1, false)).toBeNull();
  });

  it('고른 곡이 없으면 순서의 첫 곡, 빈 목록이면 null', () => {
    expect(nextIndex(plain, -1, 1, false)).toBe(0);
    expect(nextIndex([], -1, 1, true)).toBeNull();
  });

  it('셔플은 seed가 같으면 같은 순서이고 모든 곡이 한 번씩 나온다', () => {
    const a = playOrder(10, true, 42);
    expect(playOrder(10, true, 42)).toEqual(a);
    expect([...a].sort((x, y) => x - y)).toEqual([...Array(10).keys()]);
    expect(a).not.toEqual([...Array(10).keys()]);
    expect(playOrder(10, true, 43)).not.toEqual(a);
  });

  it('셔플 순서를 따라 한 바퀴 돌고 반복이면 다시 처음으로', () => {
    const order = playOrder(5, true, 7);
    const seen = [order[0]!];
    let cur: number | null = order[0]!;
    for (let i = 0; i < 4; i++) seen.push((cur = nextIndex(order, cur!, 1, false))!);
    expect(seen).toEqual(order);
    expect(nextIndex(order, cur!, 1, false)).toBeNull();
    expect(nextIndex(order, cur!, 1, true)).toBe(order[0]);
  });
});

describe('같은 방 소리 (SND-09)', () => {
  it.each([
    [0, 0],
    [1, 0.5],
    [2, 0.7],
    [3, 0.9],
    [8, 0.9],
  ])('같은 소리로 타이핑하는 다른 사람 %d명이면 %d', (n, r) => expect(sharedRatio(n)).toBe(r));

  it('종류마다 한 벌만 틀고 내 소리는 1.0으로 우선한다', () => {
    expect([...mix('rain', ['rain', 'rain', 'keys'])]).toEqual([['rain', 1], ['keys', 0.5]]);
    expect([...mix(null, ['rain', 'rain', 'keys'])]).toEqual([['rain', 0.7], ['keys', 0.5]]);
  });

  it('다른 사람 소리는 사람이 많은 종류부터 3종류까지', () => {
    const m = mix(null, ['cafe', 'fire', 'fire', 'keys', 'keys', 'keys', 'rain', 'rain']);
    expect([...m.keys()]).toEqual(['keys', 'fire', 'rain']);
    expect(m.get('keys')).toBe(0.9);
  });

  it('아무도 타이핑하지 않으면 조용하다', () => expect(mix(null, []).size).toBe(0));
});

describe('음량 바꾸는 시간 (SND-08)', () => {
  it('커질 때 0.1초, 줄 때 0.5초, 그대로면 0', () => {
    expect(fadeSec(0, 0.6)).toBe(0.1);
    expect(fadeSec(0.6, 0)).toBe(0.5);
    expect(fadeSec(0.6, 0.3)).toBe(0.5);
    expect(fadeSec(0.6, 0.6)).toBe(0);
  });
});

describe('프리셋과 친구 플리 (SND-03, SND-06, SND-07)', () => {
  const t = { k: 'a', v: 'dQw4w9WgXcQ', title: '' };
  const shared = (counts: number[], locked = false, cur = 0): Shared => ({
    presets: counts.map((n) => ({ name: '', tracks: Array(n).fill(t) })),
    cur,
    bio: '',
    locked,
    home: true,
  });

  it('v1 목록은 프리셋 1로 옮기고 재생 모드를 그대로 둔다', () => {
    const p = Playlist.parse(fromV1({ tracks: [t], repeat: false, shuffle: true }));
    expect(p.presets.map((x) => x.tracks.length)).toEqual([1, 0, 0]);
    expect([p.cur, p.repeat, p.shuffle, p.locked]).toEqual([0, false, true, false]);
  });

  it('창 제목은 이름 없는 프리셋 1이면 플레이리스트, 친구 목록이면 친구 이름', () => {
    expect(playerTitle({ name: '', tracks: [] }, 0)).toBe('플레이리스트');
    expect(playerTitle({ name: '', tracks: [] }, 2)).toBe('프리셋 3');
    expect(playerTitle({ name: 'Lofi', tracks: [] }, 0)).toBe('Lofi');
    expect(playerTitle({ name: 'Lofi', tracks: [] }, 0, '가짜 친구')).toBe('가짜 친구님의 플리');
  });

  it('친구 목록은 친구가 고른 프리셋으로 열고 비어 있으면 곡이 있는 첫 프리셋', () => {
    expect(openPreset(shared([1, 0, 2], false, 2))).toBe(2);
    expect(openPreset(shared([0, 0, 2], false, 0))).toBe(2);
    expect(openPreset(shared([0, 0, 0], false, 1))).toBe(0);
  });

  it('파도타기는 잠그지 않은 친구의 곡 있는 프리셋만 고르고 지금 듣는 목록은 뺀다', () => {
    const friends = [
      { uid: 'a', shared: shared([1, 0, 1]) },
      { uid: 'b', shared: shared([3, 3, 3], true) },
      { uid: 'c', shared: null },
    ];
    expect([0, 0.49, 0.5, 0.99].map((r) => pickSurf(friends, null, r))).toEqual([
      { uid: 'a', preset: 0 }, { uid: 'a', preset: 0 }, { uid: 'a', preset: 2 }, { uid: 'a', preset: 2 },
    ]);
    expect(pickSurf(friends, 'a:0', 0)).toEqual({ uid: 'a', preset: 2 });
    // 후보가 하나뿐이면 지금 듣는 목록이라도 고른다
    expect(pickSurf([{ uid: 'a', shared: shared([1, 0, 0]) }], 'a:0', 0.3)).toEqual({ uid: 'a', preset: 0 });
    expect(pickSurf(friends.slice(1), null, 0.5)).toBeNull();
  });
});
