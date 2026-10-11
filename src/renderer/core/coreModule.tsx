import { useEffect, useState, useSyncExternalStore } from 'react';
import { z } from 'zod';
import type { Ctx, ModuleManifest, SettingField, SettingsDecl } from './types';
import type { CoreRuntime } from './runtime';
import { coreSettings, SCALE, useCoreSettings, type CoreSettings } from './coreSettings';

/** 코어 설정과 코어 명령. 모듈처럼 등록해서 창과 명령을 같은 경로로 쓴다 (10.5 코어 설정) */
export function coreModule(core: CoreRuntime): ModuleManifest {
  const bridge = core.deps.bridge;
  const call = (p: Promise<unknown>) => void p.catch((e: Error) => core.log('warn', 'core', e.message));
  const writeDiag = () => bridge.invoke('diag.write', { lines: diagLines(core) });
  return {
    id: 'core',
    title: '코어',
    specIds: ['SET-01', 'SET-06', 'SET-07', 'SET-11', 'SET-14', 'SET-16', 'SET-17', 'AVT-12', 'NFR-04', 'NFR-08', 'NFR-19', 'NFR-21', 'NFR-22', 'NFR-25', 'CHR-12', 'OPS-13', 'ACC-05', 'ACC-12', 'SCR-08', 'SET-03', 'SET-04', 'SET-05', 'SET-12', 'SET-13', 'SET-15'],
    settings: coreSettings,
    ui: {
      windows: [
        // 탭이 한 줄에 들어가고 일반 탭의 소리 묶음까지 한 화면에 보이는 크기
        { id: 'core.settings', title: '설정', width: 500, height: 640, focusable: true, component: async () => ({ default: () => <SettingsWindow core={core} /> }) },
      ],
      contributions: [{ slot: 'settings.tabs', id: 'core.display', label: '화면', order: 5, component: ({ ctx }) => <DisplayTab core={core} ctx={ctx} /> }],
    },
    commands: [
      { id: 'core.settings', run: (ctx) => ctx.ui.open('core.settings') },
      { id: 'core.quit', run: () => core.quit() },
      // 이 PC 연결 해제 (ACC-05): 로그인만 지우고 이 PC의 파일은 남긴다. 다시 켜면 설정 코드를 묻는다
      { id: 'core.disconnect', run: () => core.quit({ signOut: true }) },
      {
        id: 'core.openLogFolder',
        run: async () => {
          await writeDiag().catch(() => undefined);
          await bridge.invoke('shell.openLogFolder', {});
        },
      },
      { id: 'core.resetPositions', run: () => bridge.invoke('win.resetPositions', {}) },
    ],
    async setup(ctx) {
      const get = () => ctx.settings.get<CoreSettings>();
      // 자동 실행은 OS 로그인 항목이 기준이다. 사용자가 OS에서 끈 값을 화면에 맞춘다
      const os = await bridge.invoke('autostart.get', {}).catch(() => get().autoStart);
      if (os !== get().autoStart) ctx.settings.set({ autoStart: os });
      let last = get();
      call(bridge.invoke('stage.setOpacity252', { on: last.opacity252 }));
      call(bridge.invoke('theme.set', { source: last.theme }));
      call(bridge.invoke('stage.coverHide', { on: last.coverHide }));
      ctx.settings.onChange(() => {
        const v = get();
        if (v.autoStart !== last.autoStart) call(bridge.invoke('autostart.set', { on: v.autoStart }));
        if (v.opacity252 !== last.opacity252) call(bridge.invoke('stage.setOpacity252', { on: v.opacity252 }));
        if (v.theme !== last.theme) call(bridge.invoke('theme.set', { source: v.theme }));
        if (v.coverHide !== last.coverHide) call(bridge.invoke('stage.coverHide', { on: v.coverHide }));
        last = v;
      });
      // 모든 모듈의 setup이 끝난 뒤에 써야 꺼진 모듈과 이유가 모두 들어간다
      ctx.lifecycle.on((e) => {
        if (e.type === 'ready') call(writeDiag());
      });
    },
  };
}

/** 진단 요약의 렌더러 쪽 줄: 코어 설정, 알 수 없는 앱 이유, 모듈 켜짐과 꺼짐, 모듈 diagnose (NFR-21) */
function diagLines(core: CoreRuntime): string[] {
  const c = core.ctxs.get('core')?.ctx;
  const s = c?.settings.get<CoreSettings>();
  const lines = [
    `코어 설정 ${JSON.stringify(s ?? null)}`,
    `앞에 있는 앱을 알 수 없는 이유: ${c?.activity.last()?.unknownReason ?? '없음'}`,
    ...core.host.status.map((m) => `모듈 ${m.id}: ${m.on ? '켜짐' : `꺼짐 (${m.reason ?? '이유 없음'})`}`),
    ...[...core.ctxs.values()].flatMap(({ manifest: m }) => {
      try {
        return m.diagnose?.() ?? [];
      } catch (e) {
        return [`${m.id}: diagnose 오류 ${e instanceof Error ? e.message : String(e)}`];
      }
    }),
  ];
  return lines.slice(0, 500).map((l) => l.slice(0, 2000));
}

/** 설정 창 (SCR-04와 SCR-06을 합침). 일반 탭은 모듈 settings 선언으로 만들고 나머지 탭은 settings.tabs 슬롯에서 받는다 */
function SettingsWindow({ core }: { core: CoreRuntime }) {
  useSyncExternalStore(core.registry.contributions.subscribe, () => core.registry.contributions.get());
  const tabs = core.registry.slot('settings.tabs').filter((x) => x.decl.component);
  const [tab, setTab] = useState('general');
  const current = tabs.find((x) => x.decl.id === tab);
  const Tab = current?.decl.component;
  // 탭을 바꾸면 지금 탭의 화면이 사라지므로 저장하지 않은 일이 있으면 먼저 묻는다 (ctx.ui.guard)
  const go = (id: string) => id !== tab && void core.windows.confirm('core.settings').then((ok) => ok && setTab(id));
  return (
    <div>
      {/* 탭이 한 줄에 다 들어가지 않으면(글자가 넓은 글꼴) 줄을 바꾸지 않고 긴 탭 이름을 단추 안에서 두 줄로 접는다.
          줄을 바꾸면 마지막 탭 하나만 둘째 줄에 남는다 */}
      <nav style={{ display: 'flex', flexWrap: 'nowrap', gap: 4, marginBottom: 12 }}>
        <button style={TAB} aria-pressed={tab === 'general'} onClick={() => go('general')}>일반</button>
        {tabs.map((x) => (
          <button key={x.decl.id} style={TAB} aria-pressed={tab === x.decl.id} onClick={() => go(x.decl.id)}>{x.decl.label}</button>
        ))}
      </nav>
      {current && Tab ? <Tab ctx={current.ctx} windowId="core.settings" /> : <General core={core} />}
    </div>
  );
}

const TAB = { flex: '0 1 auto', minWidth: 0 };

/** 일반 탭: 모듈 설정, 펜 입력 보호 앱, 시스템(자동 실행, 버전, 진단 기록). 화면 항목은 화면 탭에 있다 */
function General({ core }: { core: CoreRuntime }) {
  const entries = [...core.ctxs.values()].filter((e) => e.manifest.settings && e.manifest.id !== 'core');
  const coreCtx = core.ctxs.get('core')?.ctx;
  return (
    <div>
      {entries.map(({ manifest, ctx }) => (
        <section key={manifest.id}>
          <h4>{manifest.title ?? manifest.id}</h4>
          {Object.keys(manifest.settings!.schema.shape).map((key) => (
            <Field key={key} ctx={ctx} decl={manifest.settings!} name={key} />
          ))}
        </section>
      ))}
      {coreCtx && (
        <section>
          <h4>펜 입력 보호 앱</h4>
          <PenApps core={core} ctx={coreCtx} />
        </section>
      )}
      <section>
        <h4>시스템</h4>
        {coreCtx && <Field ctx={coreCtx} decl={coreSettings} name="autoStart" />}
        <p>버전 {core.deps.appVersion}</p>
        <details>
          <summary>개인정보 처리방침</summary>
          {PRIVACY.map((t) => <p key={t}>{t}</p>)}
        </details>
        <button onClick={() => void core.registry.run('core.openLogFolder')}>진단 기록 폴더 열기</button>
        <Disconnect core={core} />
      </section>
    </div>
  );
}

/** 개인정보 처리방침 (SET-12). 규칙(rules/core.ts와 모듈 rules.ts)과 저장 위치가 바뀌면 함께 고친다 */
const PRIVACY = [
  '이 앱은 선물한 사람이 만든 계정으로만 쓰고 연락처와 실명은 받지 않아요.',
  '서버(Google Firebase Realtime Database)에는 닉네임, 친구 코드, 캐릭터 그림과 꾸미기, 레벨, 집중 시간 합계, 친구 목록, 마이홈과 일정, 방 채팅, 올린 그림이 저장돼요.',
  '닉네임, 캐릭터, 레벨은 이 앱 계정이 있는 사람이 볼 수 있어요. 마이홈, 프로필 사진, 일정, 접속 중인 방은 친구로 등록한 사람만 보고 채팅과 방 안의 자리 정보는 그 방에 들어온 사람만 봐요.',
  '마이홈 버그제보 탭에서 보낸 글과 앱 버전은 서버에 저장되고 앱을 선물한 사람만 읽어요.',
  '앱에 오류가 나면 앱 버전, 운영체제, 최근 로그 몇 줄이 앱을 선물한 사람에게 자동으로 전해져요. 설정 일반 탭에서 끌 수 있어요.',
  '이 PC에서 쓰는 프로그램 이름, 창 제목, 키보드로 입력한 내용은 서버로 보내지 않아요.',
  '이 PC의 앱 데이터 폴더에는 설정, 프로그램별 집중 시간, 로그인 상태, 진단 기록이 남아요. 오류 자동 보고가 켜져 있으면 오류와 최근 로그 일부를 선물한 사람에게 보내요. 전체 진단 기록은 요청받았을 때 직접 보내요.',
  '기록을 지우고 싶으면 앱을 선물한 사람에게 말해 주세요.',
];

/** 이 PC 연결 해제 (ACC-05). 한 번 더 확인한 뒤 해제한다 */
function Disconnect({ core }: { core: CoreRuntime }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <p><button onClick={() => setAsking(true)}>이 PC 연결 해제</button></p>;
  return (
    <div>
      <p>이 PC에서 연결을 끊어요. 다시 쓰려면 설정 코드가 필요해요.</p>
      <button onClick={() => void core.registry.run('core.disconnect')}>연결 해제</button> <button onClick={() => setAsking(false)}>취소</button>
    </div>
  );
}

/** 사용자가 더하는 펜 입력 보호 앱 (NFR-25, CHR-12). 기본 목록은 메인 프로세스에 있다 */
function PenApps({ core, ctx }: { core: CoreRuntime; ctx: Ctx }) {
  const bridge = core.deps.bridge;
  const [apps, setApps] = useState<string[]>([]);
  useEffect(() => void bridge.invoke('penApps.get', {}).then(setApps), [bridge]);
  const save = (next: string[]) => void bridge.invoke('penApps.set', { apps: next }).then(() => setApps(next), (e: Error) => ctx.ui.toast(e.message));
  const add = () => {
    const key = ctx.activity.lastForeignApp();
    if (!key) return ctx.ui.toast('펜 입력 보호 앱을 먼저 잠깐 쓰고 이 창으로 돌아와 다시 눌러 주세요');
    if (apps.includes(key)) return ctx.ui.toast('이미 들어 있는 앱이에요.');
    save([...apps, key]);
  };
  // 기본 목록은 메인에 있어 여기에는 사용자가 더한 앱만 보인다
  return (
    <div>
      <p>펜 입력 보호 목록의 앱이 앞에 있으면 자동으로 방에서 내보내지 않아요.</p>
      <p>기본 목록 외에도 사용하는 앱을 추가할 수 있어요. 집중 기록 대상은 집중 앱 탭에서 따로 골라요.</p>
      {apps.length > 0 && (
        <ul>
          {apps.map((k) => (
            <li key={k}>
              {k.slice(4)} <button onClick={() => save(apps.filter((x) => x !== k))}>빼기</button>
            </li>
          ))}
        </ul>
      )}
      <button onClick={add}>직전에 쓴 앱을 펜 입력 보호 목록에 넣기</button>
    </div>
  );
}

/** 화면 탭 (SET-03, SET-04, SET-05, SET-06, SET-07, SET-13, SET-14, SET-15, SET-16, SET-17, NFR-04) */
function DisplayTab({ core, ctx }: { core: CoreRuntime; ctx: Ctx }) {
  const bridge = core.deps.bridge;
  const { scale } = useCoreSettings(core);
  const display = useSyncExternalStore(core.displayMode.subscribe, core.displayMode.get);
  const [displays, setDisplays] = useState<Array<{ id: number; primary: boolean; chosen: boolean }>>([]);
  const load = () => void bridge.invoke('display.list', {}).then(setDisplays);
  useEffect(load, [bridge]);
  return (
    <div>
      <label>
        회사원 모드
        <input type="checkbox" checked={display === 'quiet'} onChange={(e) => ctx.mode.set(e.target.checked ? 'quiet' : 'normal')} />
      </label>
      <p>마이홈, 말풍선, 장난 기능을 잠그고 상태칩에 숨기기가 생겨요.</p>
      <p>숨긴 화면은 Ctrl+Alt+H나 트레이 메뉴로 다시 띄워요.</p>
      <Field ctx={ctx} decl={coreSettings} name="theme" />
      <p>창과 메뉴의 밝기만 바뀌고 캐릭터 모습은 바뀌지 않아요.</p>
      {displays.length > 1 && (
        <section>
          <h4>캐릭터를 띄울 모니터</h4>
          {displays.map((d, i) => (
            <button key={d.id} aria-pressed={d.chosen} onClick={() => void bridge.invoke('display.choose', { id: d.id }).then(load, load)}>
              모니터 {i + 1}{d.primary ? ' (주)' : ''}
            </button>
          ))}
        </section>
      )}
      <label>
        캐릭터 크기 {Math.round(scale * 100)}%
        <input type="range" min={SCALE.min} max={SCALE.max} step={SCALE.step} value={scale} onChange={(e) => ctx.settings.set({ scale: Number(e.target.value) })} />
      </label>
      <Field ctx={ctx} decl={coreSettings} name="showHead" />
      <Field ctx={ctx} decl={coreSettings} name="chips" />
      <Field ctx={ctx} decl={coreSettings} name="pixel" />
      <p>캐릭터를 큰 점과 적은 색으로 옛날 게임처럼 그려요.</p>
      <hr />
      <Field ctx={ctx} decl={coreSettings} name="opacity252" />
      <p>화면 공유 영상이 깜빡일 때만 켜요. Windows 전용이에요.</p>
      <Field ctx={ctx} decl={coreSettings} name="coverHide" />
      <p>영상, 게임, 발표를 전체 화면으로 띄우면 캐릭터를 숨기고 끝나면 다시 띄워요. 그림 앱 위에서는 숨기지 않아요.</p>
      <hr />
      <p>이름표를 끌어서 캐릭터를 옮길 수 있어요.</p>
      <button onClick={() => void core.registry.run('core.resetPositions').then(() => ctx.ui.toast('위치를 처음으로 되돌렸어요'), (e: Error) => ctx.ui.toast(e.message))}>
        위치 초기화
      </button>
    </div>
  );
}

/** 설정 항목 하나. SettingField.hint가 있으면 항목 아래에 설명 줄을 둔다 (화면 탭의 회사원 모드와 같은 모양) */
function Field({ ctx, decl, name }: { ctx: Ctx; decl: SettingsDecl; name: string }) {
  const [value, setValue] = useState(() => ctx.settings.get()[name]);
  const hint = (decl.fields as Record<string, SettingField | undefined> | undefined)?.[name];
  const label = hint?.label ?? name;
  const save = (v: unknown) => {
    ctx.settings.set({ [name]: v });
    setValue(ctx.settings.get()[name]);
  };
  const field = (decl.schema.shape as Record<string, z.ZodType>)[name];
  const inner = field instanceof z.ZodDefault ? (field.def.innerType as z.ZodType) : field;
  const input =
    inner instanceof z.ZodBoolean ? <input type="checkbox" checked={Boolean(value)} onChange={(e) => save(e.target.checked)} />
    : inner instanceof z.ZodNumber ? <input type="number" min={hint?.min} max={hint?.max} value={Number(value)} onChange={(e) => save(Number(e.target.value))} />
    : inner instanceof z.ZodEnum ? (
      <select value={String(value)} onChange={(e) => save(e.target.value)}>
        {(hint?.options ?? (inner.options as string[]).map((o) => ({ value: o, label: o }))).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
    : <input value={String(value ?? '')} onChange={(e) => save(e.target.value)} />;
  return (
    <>
      <label>{label}{input}</label>
      {hint?.hint && <p>{hint.hint}</p>}
    </>
  );
}
