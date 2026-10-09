// 서버 구현 고르기. VITE_FIREBASE_DATABASE_URL이 있으면 Firebase, 없으면 오프라인 개발용 메모리 서버 (10.7.4). 배포 빌드는 메모리 서버로 켜지 않는다
import { PRESENCE_SEEN_MS } from '@shared/constants';
import { PROTO } from '@shared/proto';
import type { MemberRecord } from '@shared/schemas';
import { createFirebaseServer } from './firebase';
import { MemoryHub, createMemoryServer } from './memory';
import type { ServerPort } from './port';

/** 메모리 서버의 개발 방 코드. 가짜 친구가 들어가 있다 */
export const DEV_ROOM = 'DEVDEV';

let devHub: MemoryHub | undefined;

export function createServer(): ServerPort {
  const env = import.meta.env;
  if (env.VITE_FIREBASE_DATABASE_URL) {
    return createFirebaseServer({
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      databaseURL: env.VITE_FIREBASE_DATABASE_URL,
      appId: env.VITE_FIREBASE_APP_ID,
      databaseEmulator: env.VITE_FIREBASE_DATABASE_EMULATOR,
      authEmulator: env.VITE_FIREBASE_AUTH_EMULATOR,
    });
  }
  // 배포 빌드(--mode e2e가 아닌 빌드)가 Firebase 설정 없이 만들어졌으면 누구나 들어오는 개발 로그인으로 켜지 않는다
  if (env.MODE === 'production') throw new Error('Firebase 설정 없이 만든 빌드입니다. VITE_FIREBASE_DATABASE_URL을 넣고 다시 빌드해 주세요.');
  devHub ??= seedDevRoom(new MemoryHub());
  // 검증과 시험이 가짜 친구 기록을 바꿀 때 쓴다. 메모리 서버는 개발판과 시험판에만 있다
  (globalThis as { devHub?: MemoryHub }).devHub = devHub;
  return createMemoryServer(devHub);
}

/** 기본 외형(look null)의 가짜 친구가 개발 방에 앉아 seenAt을 계속 새로 쓴다 */
function seedDevRoom(hub: MemoryHub): MemoryHub {
  const uid = 'devfriend';
  const key = `rooms/${DEV_ROOM}/members/${uid}_dev`;
  const friend: MemberRecord = {
    uid, name: '가짜 친구', look: null, state: 'online', proto: PROTO, mods: {}, joinedAt: hub.now(), seenAt: hub.now(), m: {},
  };
  hub.writeMany({
    [`rooms/${DEV_ROOM}/meta`]: { kind: 'work', owner: uid, createdAt: hub.now() },
    [`rooms/${DEV_ROOM}/roster/${uid}`]: hub.now(),
    [key]: friend,
  });
  setInterval(() => hub.write(`${key}/seenAt`, hub.now()), PRESENCE_SEEN_MS);
  return hub;
}
