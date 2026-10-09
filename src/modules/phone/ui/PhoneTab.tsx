import { useEffect, useMemo, useReducer, useState, useSyncExternalStore } from 'react';
import type { SlotProps } from '@core/types';
import { live } from '../live';
import { linkOf, newKey, stateOf, type PhoneState } from '../logic';
import { qr } from '../qr';
import css from './phone.module.css';

const SAY: Record<PhoneState, string> = {
  off: '아직 연결하지 않았어요.',
  waiting: '폰 신호를 기다리고 있어요.',
  drawing: '연결됨. 폰에서 작업하는 중이에요.',
  expired: '열림 신호가 4시간을 넘어 더 세지 않아요. 폰에서 앱을 닫았다 다시 열어 주세요.',
  resting: '연결됨. 폰에서 쉬는 중이에요.',
};

/** 설정 창의 폰 연결 탭 (FOC-09). QR로 안내 페이지를 열고 폰 자동화가 보낸 신호를 보여 준다 */
export default function PhoneTab({ ctx }: SlotProps) {
  useSyncExternalStore(live.subscribe, () => live.version);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => ctx.timers.every(1000, redraw), [ctx]);
  const [msg, setMsg] = useState('');
  const doc = ctx.server.user();
  const run = (p: Promise<void>) => {
    setMsg('');
    p.catch((e: Error) => setMsg(e.message));
  };
  // 새 키를 쓴 뒤 예전 키 칸을 지운다. 예전 키로는 이미 쓰지 못한다
  const connect = () => run(doc.set('key', newKey()).then(() => doc.remove('sig')));
  const { key, sig } = live;
  const state = stateOf(key, sig, ctx.clock.serverNow());
  const page = ctx.tunables.get<string>('pageUrl');
  const link = key && page ? linkOf(page, ctx.self.uid(), key) : null;
  const got = ctx.clock.now() - live.gotAt < 3000;

  return (
    <div>
      <p>폰이나 태블릿에서 그리는 시간도 집중 시간으로 쌓여요. PC 앱이 켜져 있을 때만 신호를 받아요.</p>
      <p className={css.state} data-got={got} role="status">
        {got ? '신호를 받았어요.' : state === 'drawing' && sig?.app ? `연결됨. 폰에서 ${sig.app} 쓰는 중이에요.` : SAY[state]}
      </p>
      {key ? (
        <>
          {link ? <Qr text={link} /> : <p>안내 페이지 주소가 아직 없어요. 선물한 사람에게 알려 주세요.</p>}
          {link && <p className={css.muted}>폰 카메라로 찍으면 설정 안내가 열려요.</p>}
          <ol className={css.steps}>
            <li>폰에서 QR을 찍어 안내 페이지를 엽니다.</li>
            <li>안내대로 그림 앱이 열릴 때와 닫힐 때 신호를 보내는 자동화를 만듭니다. iPhone과 iPad는 단축어, 갤럭시는 MacroDroid를 씁니다.</li>
            <li>안내 페이지의 신호 보내 보기를 누르면 여기에 신호를 받았어요가 보입니다.</li>
          </ol>
          <div className={css.row}>
            {link && <button onClick={() => run(ctx.shell.copy(link).then(() => ctx.ui.toast('링크를 복사했어요.')))}>링크 복사</button>}
            <button onClick={connect}>키 새로 만들기</button>
            <button onClick={() => run(Promise.all([doc.remove('sig'), doc.remove('key')]).then(() => undefined))}>연결 끊기</button>
          </div>
          <p className={css.muted}>키를 새로 만들면 예전 폰 연결은 끊겨요.</p>
        </>
      ) : (
        <button type="submit" onClick={connect}>폰 연결하기</button>
      )}
      {msg && <p role="alert">{msg}</p>}
    </div>
  );
}

/** 흰 바탕 검은 칸 QR. 둘레에 네 칸 여백을 둔다 */
function Qr({ text }: { text: string }) {
  const m = useMemo(() => qr(text), [text]);
  if (!m) return <p>링크가 너무 길어서 QR을 만들지 못했어요. 링크 복사를 써 주세요.</p>;
  const n = m.length + 8;
  const d = m.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x + 4} ${y + 4}h1v1h-1z`] : []))).join('');
  return (
    <svg className={css.qr} viewBox={`0 0 ${n} ${n}`} role="img" aria-label="연결 QR 코드" shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
