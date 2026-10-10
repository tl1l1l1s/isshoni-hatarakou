import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  // 느린 CI 러너에 맞춘 자동 대기 한도
  expect: { timeout: 10_000 },
  workers: 1,
  // CI는 실패 아티팩트로 올릴 playwright-report도 만든다
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
});
