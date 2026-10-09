// 앱 전체가 함께 쓰는 수치. 규칙 빌드(rules/build.ts)도 이 파일을 읽는다(10.7.2).

/** 멤버 기록의 seenAt을 쓰는 간격 (10.14의 5번) */
export const PRESENCE_SEEN_MS = 60_000;
/** seenAt이 이보다 오래 바뀌지 않은 멤버는 화면에서 빼고 규칙이 지우기를 허용한다 */
export const PRESENCE_STALE_MS = 150_000;

/** electron-builder.yml의 appId. Windows 알림과 외부 플레이어의 Referer에 쓴다 */
export const APP_ID = 'app.isshoni-hatarakou.gift';

/** 하루는 한국 시간 오전 6시에 바뀐다 (FOC-05, NFR-15) */
export const KST_OFFSET_MS = 9 * 3_600_000;
export const DAY_BOUNDARY_MS = 6 * 3_600_000;

/** 방 정원 (9.3 OUR-01) */
export const ROOM_CAP_MIN = 2;
export const ROOM_CAP_MAX = 10;
export const ROOM_CODE_LENGTH = 6;
/** 0, 1, I, O를 뺀 32자 (5장 ROM-06) */
export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** 모듈 presence 필드 합계 상한 (10.3의 8번, 10.5) */
export const PRESENCE_MODULE_MAX_BYTES = 128;
export const NAME_MAX_LENGTH = 20;

/** files/{sha256}: base64로 바꾼 뒤 64KB까지, 원래 파일로는 약 48KB (10.7.6) */
export const FILE_MAX_BASE64_BYTES = 64 * 1024;
export const FILE_MAX_RAW_BYTES = Math.floor((FILE_MAX_BASE64_BYTES * 3) / 4);

/** 쓰기 값에 넣으면 서버가 지금 시각을 채운다 (Realtime Database의 서버 시각 표시). 규칙의 at === now 확인과 함께 쓴다 */
export const SERVER_TIME = { '.sv': 'timestamp' } as const;

/** 방 이벤트 (10.5 roomEvents): 보낸 앱이 60초 뒤 지우고 받는 쪽은 최근 50개만 본다 */
export const ROOM_EVENT_TTL_MS = 60_000;
export const ROOM_EVENT_MAX_CHARS = 1024;
export const ROOM_EVENT_TYPE_MAX = 64;
export const ROOM_EVENT_WINDOW = 50;

/** 메인 프로세스 활동 샘플 간격과 클릭 통과 커서 확인 (10.8.1) */
export const ACTIVITY_SAMPLE_MS = 500;
export const CURSOR_POLL_MS = 50;
export const CURSOR_NEAR_PX = 40;

/** 그리기 fps 상한 (10.8.2, NFR-10) */
export const FPS_AWAKE = 30;
export const FPS_ASLEEP = 5;
