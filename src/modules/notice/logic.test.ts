import { describe, expect, it } from 'vitest';
import { newNotes, older, parsePosts, shoutLeft, sortPosts, type Note } from './logic';

const note = (version: string): Note => ({ version, at: 0, title: version, body: '' });

describe('notice', () => {
  it('업데이트 소식은 마지막으로 본 버전 뒤부터 지금 버전까지만 보이고 처음 켠 PC에는 보이지 않는다 (OPS-17)', () => {
    const notes = [note('0.3.0'), note('0.2.10'), note('0.2.2'), note('0.1.1')];
    expect(newNotes(notes, '0.2.2', '0.2.10').map((n) => n.version)).toEqual(['0.2.10']);
    expect(newNotes(notes, '0.1.1', '0.3.0').map((n) => n.version)).toEqual(['0.3.0', '0.2.10', '0.2.2']);
    expect(newNotes(notes, '0.3.0', '0.3.0')).toEqual([]);
    expect(newNotes(notes, '', '0.3.0')).toEqual([]);
    expect(older('0.2.9', '0.2.10')).toBe(true);
    expect(older('1.0', '1.0.0')).toBe(false);
  });

  it('모양이 맞는 글만 남기고 고정한 글을 먼저, 나머지는 새것부터 놓는다 (ACC-09)', () => {
    const p = (at: number, extra = {}) => ({ tag: 'notice', title: 't', body: '', at, v: 1, ...extra });
    const rows = [
      { key: 'a', value: p(1) },
      { key: 'b', value: p(3) },
      { key: 'c', value: p(2, { pin: true }) },
      { key: 'bad', value: p(4, { link: 'file:///etc/passwd' }) },
      { key: 'bad2', value: { title: 'x' } },
    ];
    expect(sortPosts(parsePosts(rows)).map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });

  it('확성기는 받은 시각부터 sec초 동안만 남은 시간을 준다 (OPS-18)', () => {
    const s = { text: '힘내', at: 1000, sec: 60, v: 1 as const };
    expect(shoutLeft(s, 1000)).toBe(60_000);
    expect(shoutLeft(s, 31_000)).toBe(30_000);
    expect(shoutLeft(s, 61_000)).toBe(0);
    expect(shoutLeft(null, 0)).toBe(0);
  });
});
