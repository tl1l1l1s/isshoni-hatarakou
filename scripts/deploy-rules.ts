// 보안 규칙 배포 (10.9의 10번: 규칙을 앱보다 먼저 배포한다). firebase login 없이 서비스 계정으로 배포한다.
// 환경 변수: GOOGLE_APPLICATION_CREDENTIALS(서비스 계정 JSON 경로), FIREBASE_DATABASE_URL
// 사용: npm run rules:deploy
// CI가 시험한 origin/main의 database.rules.json만 배포한다. 덮어쓰기 전의 운영 규칙은 ~/isshoni-hatarakou-backups/rules에 남는다.
// 되돌릴 때는 그 파일 내용을 Firebase 콘솔의 규칙 편집기에 붙여 넣고 게시한다
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const databaseURL = process.env.FIREBASE_DATABASE_URL;
if (!databaseURL || !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS와 FIREBASE_DATABASE_URL을 넣어 주세요.');
  process.exit(1);
}
const git = (...args: string[]) => execFileSync('git', args, { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' });
git('fetch', '--quiet', 'origin', 'main');
const rules = git('show', 'origin/main:database.rules.json');
// 내 PC의 파일과 다르면 아직 올리지 않았거나 CI의 에뮬레이터 시험을 거치지 않은 규칙이다
if (readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8').replace(/\r\n/g, '\n') !== rules) {
  console.error('database.rules.json이 origin/main과 다릅니다. 올리고 CI가 통과한 뒤 배포해 주세요.');
  process.exit(1);
}
initializeApp({ databaseURL });
const dir = join(homedir(), 'isshoni-hatarakou-backups', 'rules');
mkdirSync(dir, { recursive: true });
const old = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(old, await getDatabase().getRules());
await getDatabase().setRules(rules);
// 에뮬레이터 변수가 남아 있으면 관리 SDK가 운영 대신 에뮬레이터에 배포한다
const target = process.env.FIREBASE_DATABASE_EMULATOR_HOST ? `에뮬레이터 ${process.env.FIREBASE_DATABASE_EMULATOR_HOST}` : databaseURL;
console.log(`규칙을 배포했습니다: ${target} (origin/main ${git('rev-parse', '--short', 'origin/main').trim()}, 예전 규칙 ${old})`);
process.exit(0);
