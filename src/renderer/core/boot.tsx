import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BRIDGE_VERSION } from '@shared/proto';
import { randomCode } from '@shared/codes';
import { createServer } from '@server/index';
import type { ServerPort } from '@server/port';
import { getBackend } from '@render/index';
import { modules } from '@modules/index';
import { FRAME_ORIGIN, type Bridge } from '../../preload/api';
import { getBridge } from './bridge';
import { JsonFile, emptySettings } from './persist';
import { CoreRuntime } from './runtime';
import type { ModuleManifest } from './types';
import { coreModule } from './coreModule';
import { CharacterPreview, Panels, SlotItems, Stage } from './ui/Stage';

type Profile = { name?: string; friendCode?: string };
/** 부팅 중 서버 읽기를 기다리는 시간. 오프라인이면 Firebase 읽기는 연결될 때까지 끝나지 않는다 */
const BOOT_READ_MS = 3_000;

/** 부팅 순서 (10.4). 단계마다 앞 단계가 끝난 뒤 시작하고 고정 지연은 쓰지 않는다 */
export async function boot(root: HTMLElement): Promise<void> {
  // 1-2. 브리지 버전
  const bridge = getBridge();
  if (bridge.version !== BRIDGE_VERSION) {
    root.textContent = `앱 파일이 서로 맞지 않습니다 (브리지 ${bridge.version}, 화면 ${BRIDGE_VERSION}). 앱을 다시 설치해 주세요.`;
    return;
  }
  // 외부 출처가 메인의 CSP와 다르면 메인이 저장하고 스테이지를 다시 읽는다. 모듈을 켜기 전에 확인한다
  if (await syncFrameOrigins(bridge, modules).catch(() => false)) return;
  const info = await bridge.invoke('app.info', {});
  const device = await JsonFile.load(bridge, 'device/core.json', () => ({ v: 1, deviceId: randomCode(12) }));
  await device.flush();

  // 3. 신원: 저장된 로그인을 되살리고 없으면 설정 코드를 받는다. 이 단계 전에는 타이머를 시작하지 않는다
  const server = createServer();
  const uid = (await server.identity.restore()) ?? (await signIn(bridge, server, device.value.deviceId));

  // 4-5. 설정과 모듈
  const [deviceSettings, accountSettings] = await Promise.all([
    JsonFile.load(bridge, 'settings.json', emptySettings),
    JsonFile.load(bridge, `accounts/${uid}/settings.json`, emptySettings),
  ]);
  const backend = getBackend(new URLSearchParams(location.search).get('renderer') === 'debug' ? 'debug' : 'canvas2d');
  // 오프라인이면 프로필 없이 스테이지를 먼저 띄우고 연결된 뒤에 채운다
  const profileRead = server.profile.read(uid).catch(() => null) as Promise<Profile | null>;
  const profile = await Promise.race([profileRead, new Promise<undefined>((r) => setTimeout(r, BOOT_READ_MS))]);
  const core = new CoreRuntime(
    { bridge, server, backend, uid, deviceId: device.value.deviceId, appVersion: info.version, selfAppKey: info.selfAppKey, profile, singleDevice: true, material: info.material ?? false },
    deviceSettings,
    accountSettings,
  );
  if (profile === undefined) void profileRead.then((p) => core.setProfile(p));
  core.Slot = ({ name, seat }) => <SlotItems core={core} slot={name} seat={seat} />;
  core.CharacterPreview = (p) => <CharacterPreview core={core} {...p} />;
  const manifests = [coreModule(core), ...modules];
  await core.preloadLocal(manifests);
  await core.start(manifests);
  for (const s of core.host.status) if (!s.on) core.toast(`${s.id} 기능을 켜지 못했습니다. ${s.reason ?? ''}`);
  window.addEventListener('beforeunload', () => void core.flush());

  createRoot(root).render(
    <>
      <Stage core={core} />
      <Panels core={core} />
    </>,
  );
  Object.assign(window, { core }); // 콘솔 확인과 e2e 시험이 쓴다
}

/** manifest externalOrigins를 모아 메인에 알린다. 다시 읽기를 시작했으면 true */
async function syncFrameOrigins(bridge: Bridge, manifests: ModuleManifest[]): Promise<boolean> {
  const want = new Set<string>();
  for (const m of manifests) {
    for (const o of m.externalOrigins ?? []) {
      if (FRAME_ORIGIN.test(o)) want.add(o);
      else void bridge.invoke('log.write', { level: 'warn', scope: m.id, message: `externalOrigins는 https://host[:port] 형식만 받습니다: ${o}` });
    }
  }
  const origins = [...want].sort();
  const current = await bridge.invoke('csp.frameOrigins.get', {});
  return current.join(' ') !== origins.join(' ') && bridge.invoke('csp.frameOrigins.set', { origins });
}

async function signIn(bridge: Bridge, server: ServerPort, deviceId: string): Promise<string> {
  // 메모리 서버(오프라인 개발)는 기기마다 정한 개발 계정으로 바로 들어간다
  if (server.kind === 'memory') return server.identity.signIn(`dev-${deviceId}`);
  // 창을 닫으면 다시 연다. 코드를 넣어야 시작할 수 있고 앱 끝내기는 트레이 메뉴에 있다
  for (;;) {
    const uid = await askSetupCode(bridge, (code) => server.identity.signIn(code.trim()));
    if (uid) return uid;
  }
}

/** 설정 코드 입력 창. 키보드 입력을 받아야 해서 포커스를 받는 패널로 연다.
 *  로그인하는 동안 창을 열어 두고 실패하면 그 이유를 띄운다. 로그인 전에 창을 닫으면 null */
async function askSetupCode(bridge: Bridge, signIn: (code: string) => Promise<string>): Promise<string | null> {
  const name = 'panel:core.setup';
  await bridge.invoke('win.prepare', { name, title: '설정 코드 입력', width: 360, height: 220, focusable: true, resizable: false });
  const win = window.open('', name);
  if (!win) throw new Error('설정 코드 창을 열지 못했습니다');
  win.document.title = '설정 코드 입력';
  for (const n of document.head.querySelectorAll('style, link[rel=stylesheet]')) win.document.head.appendChild(n.cloneNode(true));
  win.document.body.className = 'panel';
  const host = win.document.body.appendChild(win.document.createElement('div'));
  return new Promise((resolve) => {
    const r = createRoot(host);
    let done = false;
    let pending = false;
    const finish = (uid: string | null) => {
      if (done) return;
      done = true;
      r.unmount();
      win.close();
      resolve(uid);
    };
    // 로그인 중에 닫으면 결과를 기다린다. 실패했으면 창을 다시 연다
    win.addEventListener('pagehide', () => pending || finish(null));
    const submit = async (code: string) => {
      pending = true;
      try {
        finish(await signIn(code));
      } catch (e) {
        if (win.closed) finish(null);
        throw e;
      } finally {
        pending = false;
      }
    };
    r.render(<SetupCode submit={submit} />);
  });
}

function SetupCode({ submit }: { submit: (code: string) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    // 성공하면 창이 닫힌다. 실패하면 서버가 알려 준 이유(코드 형식, 연결, 틀린 코드)를 띄운다
    submit(code).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    });
  };
  return (
    <form onSubmit={(e) => (e.preventDefault(), send())}>
      <p>선물받은 설정 코드를 붙여 넣어 주세요.</p>
      {error && <p role="alert">{error}</p>}
      <input autoFocus aria-label="설정 코드" value={code} disabled={busy} onChange={(e) => setCode(e.target.value)} style={{ width: '100%' }} />
      <p><button type="submit" disabled={busy}>{busy ? '확인하는 중이에요' : '시작하기'}</button></p>
    </form>
  );
}
