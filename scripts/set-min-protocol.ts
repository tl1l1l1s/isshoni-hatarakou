// 방 입장 최소 프로토콜 (ROM-10, 10.10.4). 선물하는 사람이 친구 앱이 업데이트된 것을 확인한 뒤 실행한다.
// 이보다 낮은 PROTO의 앱은 방에 들어가지 못하고 업데이트 안내를 본다. 방을 닫을 필요는 없다.
// 사용:  node scripts/set-min-protocol.ts <번호>
// 환경 변수: GOOGLE_APPLICATION_CREDENTIALS(서비스 계정 JSON 경로), FIREBASE_DATABASE_URL
//            에뮬레이터에는 FIREBASE_DATABASE_EMULATOR_HOST를 함께 넣는다
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { PROTO } from '../src/shared/proto.ts';

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const n = Number(process.argv[2]);
if (!Number.isInteger(n) || n < 1) fail('사용: node scripts/set-min-protocol.ts <번호>');
// 지금 소스의 PROTO보다 높이면 출시한 어떤 앱도 방에 들어가지 못한다
if (n > PROTO) fail(`출시하지 않은 프로토콜입니다. 지금 PROTO는 ${PROTO}입니다.`);
const databaseURL = process.env.FIREBASE_DATABASE_URL ?? fail('FIREBASE_DATABASE_URL을 넣어 주세요.');
initializeApp({ databaseURL });
const ref = getDatabase().ref('config/minProtocol');
const before = (await ref.get()).val() as number | null;
await ref.set(n);
console.log(`config/minProtocol: ${before ?? '없음(1로 봄)'} → ${n}`);
process.exit(0);
