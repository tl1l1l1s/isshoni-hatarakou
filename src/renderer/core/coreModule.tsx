import { useEffect, useState, useSyncExternalStore } from 'react';
import { z } from 'zod';
import type { Ctx, ModuleManifest, SettingsDecl } from './types';
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
        { id: 'core.settings', title: '설정', width: 420, height: 520, focusable: true, component: async () => ({ default: () => <SettingsWindow core={core} /> }) },
      ],
      contributions: [{ slot: 'settings.tabs', id: 'core.display', label: '화면', order: 20, component: ({ ctx }) => <DisplayTab core={core} ctx={ctx} /> }],
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
      ctx.settings.onChange(() => {
        const v = get();
        if (v.autoStart !== last.autoStart) call(bridge.invoke('autostart.set', { on: v.autoStart }));
        if (v.opacity252 !== last.opacity252) call(bridge.invoke('stage.setOpacity252', { on: v.opacity252 }));
        if (v.theme !== last.theme) call(bridge.invoke('theme.set', { source: v.theme }));
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
  return (
    <div>
      <nav style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        <button aria-pressed={tab === 'general'} onClick={() => setTab('general')}>일반</button>
        {tabs.map((x) => (
          <button key={x.decl.id} aria-pressed={tab === x.decl.id} onClick={() => setTab(x.decl.id)}>{x.decl.label}</button>
        ))}
      </nav>
      {current && Tab ? <Tab ctx={current.ctx} /> : <General core={core} />}
    </div>
  );
}

/** 일반 탭: 모듈 설정, 시스템(자동 실행, 그림 앱, 버전, 진단 기록). 화면 항목은 화면 탭에 있다 */
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
      <section>
        <h4>시스템</h4>
        {coreCtx && <Field ctx={coreCtx} decl={coreSettings} name="autoStart" />}
        {coreCtx && <PenApps core={core} ctx={coreCtx} />}
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
  '이 PC에서 쓰는 프로그램 이름, 창 제목, 키보드로 입력한 내용은 서버로 보내지 않아요.',
  '이 PC의 앱 데이터 폴더에는 설정, 프로그램별 집중 시간, 로그인 상태, 진단 기록이 남아요. 진단 기록은 직접 보내기 전에는 PC 밖으로 나가지 않아요.',
  '기록을 지우고 싶으면 앱을 선물한 사람에게 말해 주세요.',
];

/** 이 PC 연결 해제 (ACC-05). 한 번 더 확인한 뒤 해제한다 */
function Disconnect({ core }: { core: CoreRuntime }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <p><button onClick={() => setAsking(true)}>이 PC 연결 해제</button></p>;
  return (
    <div>
      <p>이 PC에서 계정 연결을 끊어요. 이 PC의 기록은 남고 다시 쓰려면 설정 코드를 넣어야 해요.</p>
      <button onClick={() => void core.registry.run('core.disconnect')}>연결 해제</button> <button onClick={() => setAsking(false)}>취소</button>
    </div>
  );
}

/** 사용자가 더하는 그림 앱 (NFR-25, CHR-12). 기본 목록은 메인 프로세스에 있다 */
function PenApps({ core, ctx }: { core: CoreRuntime; ctx: Ctx }) {
  const bridge = core.deps.bridge;
  const [apps, setApps] = useState<string[]>([]);
  useEffect(() => void bridge.invoke('penApps.get', {}).then(setApps), [bridge]);
  const save = (next: string[]) => void bridge.invoke('penApps.set', { apps: next }).then(() => setApps(next), (e: Error) => ctx.ui.toast(e.message));
  const add = () => {
    const key = ctx.activity.lastForeignApp();
    if (!key) return ctx.ui.toast('그림 앱을 먼저 잠깐 쓰고 이 창으로 돌아와 다시 눌러 주세요');
    if (!apps.includes(key)) save([...apps, key]);
  };
  return (
    <div>
      <p>그림 앱이 앞에 있는 동안에는 펜을 잠시 멈춰도 작업 중으로 보고 오래 쉬어도 방에서 자동으로 나가지 않아요. 자주 쓰는 그림 앱은 이미 들어 있어요.</p>
      <ul>
        {apps.map((k) => (
          <li key={k}>
            {k.slice(4)} <button onClick={() => save(apps.filter((x) => x !== k))}>빼기</button>
          </li>
        ))}
      </ul>
      <button onClick={add}>직전에 쓴 앱을 그림 앱으로 넣기</button>
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
      <p>켜면 마이홈, 머리 위 말풍선, 장난 기능이 잠기고 상태칩의 ▪ 버튼으로 화면을 바로 숨길 수 있어요. 숨긴 화면은 Ctrl+Alt+H나 트레이 메뉴로 다시 띄워요.</p>
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
      <p>화면 공유 영상이 검어지거나 깜빡일 때만 켜세요. 그런 일이 없으면 그냥 두세요. Windows에서만 바뀌어요.</p>
      <button onClick={() => void core.registry.run('core.resetPositions')}>창 위치 초기화</button>
    </div>
  );
}

function Field({ ctx, decl, name }: { ctx: Ctx; decl: SettingsDecl; name: string }) {
  const [value, setValue] = useState(() => ctx.settings.get()[name]);
  const hint = (decl.fields as Record<string, { label?: string; min?: number; max?: number; options?: Array<{ value: string; label: string }> }> | undefined)?.[name];
  const label = hint?.label ?? name;
  const save = (v: unknown) => {
    ctx.settings.set({ [name]: v });
    setValue(ctx.settings.get()[name]);
  };
  const field = (decl.schema.shape as Record<string, z.ZodType>)[name];
  const inner = field instanceof z.ZodDefault ? (field.def.innerType as z.ZodType) : field;
  if (inner instanceof z.ZodBoolean) return <label>{label}<input type="checkbox" checked={Boolean(value)} onChange={(e) => save(e.target.checked)} /></label>;
  if (inner instanceof z.ZodNumber) return <label>{label}<input type="number" min={hint?.min} max={hint?.max} value={Number(value)} onChange={(e) => save(Number(e.target.value))} /></label>;
  if (inner instanceof z.ZodEnum) {
    const opts = hint?.options ?? (inner.options as string[]).map((o) => ({ value: o, label: o }));
    return <label>{label}<select value={String(value)} onChange={(e) => save(e.target.value)}>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
  }
  return <label>{label}<input value={String(value ?? '')} onChange={(e) => save(e.target.value)} /></label>;
}
