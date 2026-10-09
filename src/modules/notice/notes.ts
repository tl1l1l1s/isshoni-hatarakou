import type { Note } from './logic';

// 버전마다 바뀐 점 (OPS-17). 출시할 때 package.json 버전과 같은 version으로 맨 위에 한 항목을 더한다.
// 업데이트한 뒤 처음 켜면 마지막으로 본 버전 뒤부터 지금 버전까지의 항목을 한 번 보여 주고 우편함 업데이트 탭에도 남긴다
export const NOTES: Note[] = [
  {
    version: '0.1.0',
    at: Date.parse('2026-10-09T18:00:00+09:00'),
    title: '0.1.0 첫 버전',
    body: '같이 일할 캐릭터가 도착했어요.\n업데이트는 실행 화면의 다시 시작 버튼으로 설치해요.',
  },
];
