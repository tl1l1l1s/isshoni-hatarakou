// 보안 규칙 배포 (10.9의 10번: 규칙을 앱보다 먼저 배포한다). firebase login 없이 서비스 계정으로 배포한다.
// 환경 변수: GOOGLE_APPLICATION_CREDENTIALS(서비스 계정 JSON 경로), FIREBASE_DATABASE_URL
// 사용: npm run rules:deploy
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const databaseURL = process.env.FIREBASE_DATABASE_URL;
if (!databaseURL || !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS와 FIREBASE_DATABASE_URL을 넣어 주세요.');
  process.exit(1);
}
const rules = readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8');
initializeApp({ databaseURL });
await getDatabase().setRules(rules);
console.log(`규칙을 배포했습니다: ${databaseURL}`);
process.exit(0);
