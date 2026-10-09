// 계정 발급 (10.7.2 신원, ACC-04, ACC-08). 선물하는 사람이 실행한다.
// 사용:  node scripts/create-account.ts <이름>        새 계정과 친구 코드를 만들고 설정 코드 한 줄을 출력한다
//        node scripts/create-account.ts --reset <uid>  비밀번호를 새로 만들고 기존 로그인을 끊은 뒤 새 설정 코드를 출력한다
// 환경 변수: GOOGLE_APPLICATION_CREDENTIALS(서비스 계정 JSON 경로), FIREBASE_DATABASE_URL
//            에뮬레이터에는 FIREBASE_AUTH_EMULATOR_HOST, FIREBASE_DATABASE_EMULATOR_HOST를 함께 넣는다
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { NAME_MAX_LENGTH } from '../src/shared/constants.ts';
import { randomCode } from '../src/shared/codes.ts';
import { encodeSetupCode } from '../src/renderer/server/firebase/setup-code.ts';


/** 친구 코드는 8자: 6자 방 코드와 길이로 구분되고 32의 8제곱(약 1조) 가짓수라 추측하기 어렵다 */
const FRIEND_CODE_LENGTH = 8;
/** 비밀번호 24자, 32자 알파벳이라 120비트 */
const password = () => randomCode(24);

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const [first, second] = process.argv.slice(2);
if (!first) fail('사용: node scripts/create-account.ts <이름> | --reset <uid>');
const databaseURL = process.env.FIREBASE_DATABASE_URL ?? fail('FIREBASE_DATABASE_URL을 넣어 주세요.');
initializeApp({ databaseURL });
const auth = getAuth();
const db = getDatabase();

if (first === '--reset') {
  const uid = second ?? fail('사용: node scripts/create-account.ts --reset <uid>');
  const { email } = await auth.getUser(uid);
  const pw = password();
  await auth.updateUser(uid, { password: pw });
  await auth.revokeRefreshTokens(uid);
  console.error(`${uid}의 비밀번호를 새로 만들었습니다. 옛 설정 코드는 더 쓸 수 없습니다.`);
  console.log(encodeSetupCode(email ?? fail('이메일이 없는 계정입니다.'), pw));
} else {
  const name = first.trim();
  if (!name || name.length > NAME_MAX_LENGTH) fail(`이름은 1자에서 ${NAME_MAX_LENGTH}자까지입니다.`);
  const email = `${randomCode(12).toLowerCase()}@isshoni-hatarakou.invalid`;
  const pw = password();
  const { uid } = await auth.createUser({ email, password: pw, displayName: name });
  // codes/{code}는 없을 때만 만든다
  let friendCode = '';
  for (let i = 0; i < 5 && !friendCode; i++) {
    const code = randomCode(FRIEND_CODE_LENGTH);
    const { committed } = await db.ref(`codes/${code}`).transaction((cur: unknown) => (cur === null ? uid : undefined));
    if (committed) friendCode = code;
  }
  if (!friendCode) fail('친구 코드를 만들지 못했습니다. 다시 실행해 주세요.');
  await db.ref(`users/${uid}/public`).set({ v: 1, name, friendCode });
  console.error(`${name}: uid ${uid}, 친구 코드 ${friendCode}`);
  console.log(encodeSetupCode(email, pw));
}
process.exit(0);
