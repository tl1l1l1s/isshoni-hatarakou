import { app } from 'electron';
import log from 'electron-log/main';
import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { release, version } from 'node:os';
import { join } from 'node:path';

const KEEP_MS = 7 * 86_400_000;

export const logDir = () => join(app.getPath('userData'), 'logs');

/** 지역 날짜 YYYY-MM-DD */
const day = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/** 날짜마다 main-YYYY-MM-DD.log에 쓰고 7일보다 오래된 로그를 지운다 */
export function initLog(): void {
  const dir = logDir();
  log.transports.file.resolvePathFn = (_v, m) => join(dir, `main-${day(m?.date ?? new Date())}.log`);
  log.errorHandler.startCatching({ showDialog: false });
  try {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (f.startsWith('main-') && statSync(p).mtimeMs < Date.now() - KEEP_MS) unlinkSync(p);
    }
  } catch {
    // 첫 실행이면 폴더가 없다
  }
}

/** 진단 요약에 넣을 메인 쪽 상태. 이름과 값 (NFR-21) */
export const mainStatus: Record<string, string> = {};

/** logs/diagnose.txt를 새로 쓴다. 부팅 때와 진단 기록 폴더를 열 때 렌더러가 부른다 (NFR-21) */
export function writeDiagnose(lines: string[]): void {
  const head = [
    `진단 요약 ${new Date().toISOString()}`,
    `Isshoni Hatarakou ${app.getVersion()}${app.isPackaged ? '' : ' 개발판'}, Electron ${process.versions.electron}, ${version()} ${release()} ${process.arch}`,
    ...Object.entries(mainStatus).map(([k, v]) => `${k}: ${v}`),
  ];
  mkdirSync(logDir(), { recursive: true });
  writeFileSync(join(logDir(), 'diagnose.txt'), `${[...head, ...lines].join('\n')}\n`);
}
