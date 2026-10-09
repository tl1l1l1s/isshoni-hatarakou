import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createStore, readJson, safeRel, writeJsonAtomic } from './store';

let root = '';
afterEach(() => rmSync(root, { recursive: true, force: true }));
const tmp = () => (root = mkdtempSync(join(tmpdir(), 'store-')));

describe('safeRel', () => {
  it('허용한 경로만 받고 \\를 /로 바꾼다', () => {
    expect(safeRel('settings.json')).toBe('settings.json');
    expect(safeRel('accounts\\u1\\modules\\focus.json')).toBe('accounts/u1/modules/focus.json');
    expect(safeRel('device/modules/x.json')).toBe('device/modules/x.json');
    expect(safeRel('cache/catalog/items.json')).toBe('cache/catalog/items.json');
  });
  it.each([
    '', '/settings.json', 'C:/settings.json', '../settings.json', 'accounts/../settings.json',
    'accounts//a.json', 'accounts/./a.json', 'accounts/a.txt', 'backups/a.json', 'other.json',
    'cache/a:b.json', 'settings.json/',
  ])('거부: %s', (p) => expect(() => safeRel(p)).toThrow());
});

describe('readJson, writeJsonAtomic', () => {
  it('없으면 null, 쓰면 읽히고 임시 파일이 남지 않는다', () => {
    tmp();
    expect(readJson(root, 'accounts/u1/settings.json')).toBeNull();
    writeJsonAtomic(root, 'accounts/u1/settings.json', { a: 1 });
    expect(readJson(root, 'accounts/u1/settings.json')).toEqual({ a: 1 });
    expect(readdirSync(join(root, 'accounts/u1'))).toEqual(['settings.json']);
  });
  it('깨진 JSON은 .bak으로 옮기고 null', () => {
    tmp();
    writeFileSync(join(root, 'settings.json'), '{oops');
    expect(readJson(root, 'settings.json')).toBeNull();
    expect(readFileSync(join(root, 'settings.json.bak'), 'utf8')).toBe('{oops');
    expect(readdirSync(root)).toEqual(['settings.json.bak']);
  });
});

describe('createStore', () => {
  it('파일마다 마지막 값만 flush 때 쓰고 그 전에도 읽기는 새 값을 준다', () => {
    tmp();
    const errors: unknown[] = [];
    const s = createStore(root, (e) => errors.push(e), 60_000);
    s.write('settings.json', { v: 1 });
    s.write('settings.json', { v: 2 });
    expect(readdirSync(root)).toEqual([]);
    expect(s.read('settings.json')).toEqual({ v: 2 });
    s.flush();
    expect(readJson(root, 'settings.json')).toEqual({ v: 2 });
    expect(() => s.write('../x.json', 1)).toThrow();
    expect(errors).toEqual([]);
  });
});
