// 시험 사용자를 계정 발급 스크립트가 만든 계정처럼 만든다 (rules/core.ts의 ISSUED, ADR 0020)
// 루트에 여러 경로 쓰기로 넣는다: ctx.database().ref().update(issued('alice', 'bob'))
export const issued = (...uids: string[]) => Object.fromEntries(uids.map((uid) => [`users/${uid}/public/friendCode`, `CODE${uid}`]));
