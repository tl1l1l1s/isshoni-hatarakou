// 방 입장 최소 프로토콜 (ROM-10, 10.10.4). 선물하는 사람이 친구 앱이 업데이트된 것을 확인한 뒤 실행한다.
// 이보다 낮은 PROTO의 앱은 방에 들어가지 못하고 업데이트 안내를 본다. 방을 닫을 필요는 없다.
// 실행하면 먼저 기기마다 앱 버전과 프로토콜을 보여 주고 낮은 기기가 있으면 --force 없이는 바꾸지 않는다 (OPS-7)
// 사용:  node scripts/set-min-protocol.ts <번호> [--force]
// 환경 변수: GOOGLE_APPLICATION_CREDENTIALS(서비스 계정 JSON 경로), FIREBASE_DATABASE_URL
//            에뮬레이터에는 FIREBASE_DATABASE_EMULATOR_HOST를 함께 넣는다
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { PROTO } from '../src/shared/proto.ts';
import { readVersions, versionLines } from './ops.ts';

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const n = Number(process.argv[2]);
if (!Number.isInteger(n) || n < 1) fail('사용: node scripts/set-min-protocol.ts <번호> [--force]');
// 지금 소스의 PROTO보다 높이면 출시한 어떤 앱도 방에 들어가지 못한다
if (n > PROTO) fail(`출시하지 않은 프로토콜입니다. 지금 PROTO는 ${PROTO}입니다.`);
const databaseURL = process.env.FIREBASE_DATABASE_URL ?? fail('FIREBASE_DATABASE_URL을 넣어 주세요.');
initializeApp({ databaseURL });
const db = getDatabase();
const users = await readVersions(db);
console.log(versionLines(users).join('\n') || '기기 기록이 없습니다.');
const old = Object.values(users).flatMap((u) => Object.values(u.private?.devices ?? {})).filter((d) => (d.proto ?? 0) < n).length;
if (old && !process.argv.includes('--force')) fail(`프로토콜 ${n}보다 낮은 기기가 ${old}대 있습니다. 그 앱은 방에 들어가지 못합니다. 업데이트를 확인했거나 쓰지 않는 기기면 --force를 붙여 다시 실행해 주세요.`);
const ref = db.ref('config/minProtocol');
const before = (await ref.get()).val() as number | null;
await ref.set(n);
console.log(`config/minProtocol: ${before ?? '없음(1로 봄)'} → ${n}`);
process.exit(0);
