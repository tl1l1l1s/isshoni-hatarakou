// play 공개 값. 다른 모듈은 이 파일만 import한다

/** 놀이 레벨 보상 (GRW-02). gate id는 play.<키>이고 growth의 level로 연다. 보상표 화면이 이 값을 읽는다 */
export const PLAY_LEVELS = { dance: 80, bomb: 100, dance2: 150, flyColor: 200 } as const;
