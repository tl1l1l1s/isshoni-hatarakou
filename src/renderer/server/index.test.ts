import { afterEach, expect, it, vi } from 'vitest';
import { createServer } from './index';

afterEach(() => vi.unstubAllEnvs());

it('배포 빌드에 Firebase 주소가 없으면 개발 로그인 메모리 서버로 켜지 않고 멈춘다', () => {
  vi.stubEnv('VITE_FIREBASE_DATABASE_URL', '');
  vi.stubEnv('MODE', 'production');
  expect(() => createServer()).toThrow('Firebase');
});
