// 선물하는 사람의 운영 도구 (OPS-21). 관리 화면 대신 이 스크립트로 우편, 확성기, 버그 제보, 서버 조정값을 다룬다.
// 사용:
//   node scripts/ops.ts mail <제목> <본문> [--tag notice|update|letter] [--to <친구 코드|uid>] [--link <주소>] [--pin]
//                       --to가 없으면 모두에게 보내고 기본 태그는 모두에게 notice, 한 사람에게 letter다 (ACC-09, OPS-01)
//   node scripts/ops.ts mails [--to <친구 코드|uid>]        보낸 글 목록과 id
//   node scripts/ops.ts unmail <id> [--to <친구 코드|uid>]  글 지우기
//   node scripts/ops.ts shout <글> [--sec 60]               접속 중인 모든 캐릭터 위에 잠깐 띄운다 (OPS-18)
//   node scripts/ops.ts reports [--clear]                   버그 제보 읽기. --clear는 읽은 제보를 지운다 (OPS-03)
//   node scripts/ops.ts tunable <모듈> [<키> <JSON 값>]     서버 조정값 보기와 바꾸기 (OPS-12)
//        --from <시각> --until <시각>  기간 한정 값을 더한다. 시각은 2026-10-10T00:00+09:00 형식이다
//        <키> --clear                  키를 지워 앱 기본값으로 돌린다
// 환경 변수: GOOGLE_APPLICATION_CREDENTIALS(서비스 계정 JSON 경로), FIREBASE_DATABASE_URL
//            에뮬레이터에는 FIREBASE_DATABASE_EMULATOR_HOST를 함께 넣는다
import { parseArgs } from 'node:util';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase, ServerValue } from 'firebase-admin/database';
import { Post, SHOUT_SEC, Shout, type Tag } from '../src/modules/notice/logic.ts';
import { isPeriodList } from '../src/renderer/core/tunables.ts';

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

/** 기간 한정 값 목록에 하나를 더한다. 끝난 기간은 빼고 값 하나만 있던 자리는 기간 없는 항목이 된다 (OPS-12) */
export function addPeriod(cur: unknown, entry: { value: unknown; from: number; until: number }, now: number): unknown[] {
  // 배열 값(레벨 표 같은 것)은 기간 목록이 아니라 값 하나다. 목록의 빈 칸(null)은 뺀다
  const list = cur === null || cur === undefined ? [] : isPeriodList(cur) ? cur : [{ value: cur }];
  return [...list.filter((e) => e !== null && (e.until === undefined || e.until > now)), entry];
}

const time = (s: string | undefined, what: string): number => {
  const t = Date.parse(s ?? '');
  return Number.isNaN(t) ? fail(`${what} 시각을 읽지 못했습니다: ${s ?? '없음'}`) : t;
};

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      tag: { type: 'string' }, to: { type: 'string' }, link: { type: 'string' }, pin: { type: 'boolean' },
      sec: { type: 'string' }, clear: { type: 'boolean' }, from: { type: 'string' }, until: { type: 'string' },
    },
  });
  const [cmd, ...args] = positionals;
  const databaseURL = process.env.FIREBASE_DATABASE_URL ?? fail('FIREBASE_DATABASE_URL을 넣어 주세요.');
  initializeApp({ databaseURL });
  const db = getDatabase();

  /** 친구 코드나 uid를 uid로 */
  const uidOf = async (to: string): Promise<string> => {
    const byCode = (await db.ref(`codes/${to.trim().toUpperCase()}`).get()).val() as string | null;
    if (byCode) return byCode;
    if ((await db.ref(`users/${to}/public`).get()).exists()) return to;
    return fail(`친구 코드나 uid를 찾지 못했습니다: ${to}`);
  };
  const mailRef = async () => db.ref(values.to ? `mod/notice/u/${await uidOf(values.to)}/mail` : 'mod/notice/g/posts');

  if (cmd === 'mail') {
    const [title, body] = args;
    if (!title || body === undefined) fail('사용: node scripts/ops.ts mail <제목> <본문> [--tag notice|update|letter] [--to <친구 코드|uid>] [--link <주소>] [--pin]');
    const post = {
      tag: (values.tag ?? (values.to ? 'letter' : 'notice')) as Tag,
      title, body: body.replaceAll('\\n', '\n'),
      ...(values.link && { link: values.link }),
      ...(values.pin && { pin: true }),
      at: Date.now(), v: 1,
    };
    const r = Post.safeParse(post);
    if (!r.success) fail(`글 형식이 맞지 않습니다: ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(', ')}`);
    // push 키는 -로 시작해 명령 인자로 넘기기 어렵다. 같은 길이의 36진수 시각이라 키 순서가 시간 순서다
    const ref = (await mailRef()).child(Date.now().toString(36));
    await ref.set({ ...r.data, at: ServerValue.TIMESTAMP });
    console.log(`보냈습니다. id ${ref.key}`);
  } else if (cmd === 'mails') {
    const all = ((await (await mailRef()).get()).val() ?? {}) as Record<string, { tag: string; title: string; at: number; pin?: boolean }>;
    for (const [id, p] of Object.entries(all)) console.log(`${id}  ${new Date(p.at).toLocaleString('ko-KR')}  ${p.tag}${p.pin ? ' 고정' : ''}  ${p.title}`);
    if (!Object.keys(all).length) console.log('보낸 글이 없습니다.');
  } else if (cmd === 'unmail') {
    const id = args[0] ?? fail('사용: node scripts/ops.ts unmail <id> [--to <친구 코드|uid>]');
    const ref = (await mailRef()).child(id);
    if (!(await ref.get()).exists()) fail(`글이 없습니다: ${id}`);
    await ref.remove();
    console.log(`지웠습니다. id ${id}`);
  } else if (cmd === 'shout') {
    const sec = Number(values.sec ?? SHOUT_SEC);
    const r = Shout.safeParse({ text: args[0], at: Date.now(), sec, v: 1 });
    if (!r.success) fail('사용: node scripts/ops.ts shout <140자까지의 글> [--sec 1부터 600까지]');
    await db.ref('mod/notice/g/shout').set({ ...r.data, at: ServerValue.TIMESTAMP });
    console.log(`${sec}초 동안 띄웁니다.`);
  } else if (cmd === 'reports') {
    const all = ((await db.ref('mod/report/u').get()).val() ?? {}) as Record<string, { r?: Record<string, { text: string; ver: string; at: number }> }>;
    const done: Record<string, null> = {};
    for (const [uid, { r = {} }] of Object.entries(all)) {
      const name = (await db.ref(`users/${uid}/public/name`).get()).val() as string | null;
      for (const [id, x] of Object.entries(r)) {
        console.log(`\n[${new Date(x.at).toLocaleString('ko-KR')}] ${name ?? '이름 없음'} (${uid}), 앱 ${x.ver}\n${x.text}`);
        done[`${uid}/r/${id}`] = null;
      }
    }
    if (!Object.keys(done).length) console.log('제보가 없습니다.');
    else if (values.clear) {
      await db.ref('mod/report/u').update(done);
      console.log(`\n제보 ${Object.keys(done).length}개를 지웠습니다.`);
    }
  } else if (cmd === 'tunable') {
    const [mod, key, json] = args;
    if (!mod || !/^[a-z][a-z0-9]*$/.test(mod)) fail('사용: node scripts/ops.ts tunable <모듈> [<키> <JSON 값>] [--from <시각> --until <시각>] [--clear]');
    const ref = db.ref(`mod/${mod}/g/tunables`);
    if (key && values.clear) await ref.child(key).remove();
    else if (key) {
      let value: unknown;
      try {
        value = JSON.parse(json ?? fail('값을 JSON으로 적어 주세요. 예: 35, "https://..."'));
      } catch {
        fail(`JSON으로 읽지 못했습니다: ${json}`);
      }
      if (values.from || values.until) {
        const from = time(values.from, '시작');
        const until = time(values.until, '끝');
        if (until <= from) fail('끝 시각이 시작 시각보다 늦어야 합니다.');
        const cur = (await ref.child(key).get()).val() as unknown;
        await ref.child(key).set(addPeriod(cur, { value, from, until }, Date.now()));
      } else await ref.child(key).set(value);
    }
    // 앱은 모듈이 선언한 schema에 맞지 않는 값을 무시하고 기본값을 쓴다
    console.log(`mod/${mod}/g/tunables: ${JSON.stringify((await ref.get()).val() ?? {}, null, 2)}`);
  } else {
    fail('명령: mail, mails, unmail, shout, reports, tunable. 파일 맨 위 주석에 사용법이 있습니다.');
  }
}

if (import.meta.main) {
  await main();
  process.exit(0);
}
