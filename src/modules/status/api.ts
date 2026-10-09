// status 공개 값. 다른 모듈은 이 파일만 import한다

/**
 * 머리 위 말풍선 우선순위 (CHR-09). 좌석마다 가장 높은 글 하나만 보인다.
 * 자리비움 400, 채팅 300, 고른 상태 200, 오늘 집중 시간 100
 */
export const BUBBLE_PRIORITY = { away: 400, chat: 300, status: 200, today: 100 } as const;
