import { z } from 'zod';
import { defineModule } from '@core/types';
import type {} from '@modules/chat/api';
import type { SoundApi } from './api';
import { createChime } from './chime';
import { CHIMES, fromV1, initialPlaylist, isKind, KINDS, KIND_LABEL, mix, Playlist, PLAYER, Settings, SharedDoc, type Kind } from './logic';
import { createNoise } from './noise';
import { play, upload, WINDOW } from './state';
import Chip from './ui/Chip';

const TYPING_IDLE_SEC = 1;

export default defineModule<SoundApi>({
  id: 'sound',
  title: '소리',
  version: '0.1.0',
  specIds: ['SND-01', 'SND-02', 'SND-03', 'SND-04', 'SND-05', 'SND-06', 'SND-07', 'SND-08', 'SND-09', 'COM-03'],
  optionalRequires: ['friends', 'growth', 'account'],
  uses: ['platform.activity'],
  settings: {
    version: 1,
    scope: 'device',
    schema: Settings,
    fields: {
      musicVolume: { label: '플레이리스트 음량', widget: 'number', min: 0, max: 100 },
      noise: {
        label: '백색소음',
        widget: 'select',
        options: [{ value: 'off', label: '끄기' }, ...KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))],
      },
      noiseVolume: { label: '백색소음 음량', widget: 'number', min: 0, max: 100 },
      shareOthers: { label: '같은 방 사람들 소리도 함께 듣기', widget: 'toggle' },
      chatSound: {
        label: '채팅 알림음',
        widget: 'select',
        options: [{ value: 'off', label: '끄기' }, ...CHIMES.map((c) => ({ value: c, label: `알림음 ${c}` }))],
      },
    },
  },
  local: { device: { version: 2, schema: Playlist, initial: initialPlaylist, migrate: [fromV1] } },
  // 친구가 읽는 플리 사본 (SND-05..SND-07). 데이터는 친구에게만 보인다 (10.14의 16번)
  server: { version: 1, collections: { share: { scope: 'user', schema: SharedDoc, template: 'friendsRead' } } },
  // 타이핑 여부는 바뀔 때만 쓰고 3초보다 자주 쓰지 않는다 (10.7.5 내려받기 비용)
  presence: {
    noise: { schema: z.enum(KINDS).nullable(), sync: 'onChange' },
    typing: { schema: z.boolean(), sync: 'onChange', minIntervalMs: 3_000 },
  },
  externalOrigins: ['https://www.youtube-nocookie.com'],
  ui: {
    windows: [
      { id: WINDOW, title: '플레이리스트', width: PLAYER.width, height: PLAYER.height, focusable: true, keepAlive: true, component: () => import('./ui/PlayerWindow') },
    ],
    contributions: [
      { slot: 'menu.main', id: 'sound.menu', label: '플레이리스트', command: 'sound.open', order: 30 },
      { slot: 'chip.buttons', id: 'sound.chip', label: '플레이리스트', component: Chip, order: 10 },
    ],
  },
  commands: [{ id: 'sound.open', run: (ctx) => ctx.ui.open(WINDOW) }],
  setup(ctx) {
    const noise = createNoise(ctx);
    const chime = createChime();
    const settings = () => ctx.settings.get<Settings>();
    const quiet = () => ctx.mode.get() === 'quiet';
    let typing = false;
    let mine = { noise: null as Kind | null, typing: false };
    let playing = '';

    // 내 소리는 타이핑하는 동안만, 다른 사람 소리는 그 사람이 타이핑하는 동안만 난다 (SND-08, SND-09).
    // 회사원 모드(quiet)에서는 내 소리도 다른 사람 소리도 끈다. 화면 숨김(hidden)에서는 그대로 난다
    const update = () => {
      const s = settings();
      const kind = s.noise === 'off' ? null : s.noise;
      const next = { noise: kind, typing: typing && kind !== null };
      if (next.noise !== mine.noise || next.typing !== mine.typing) ctx.room.setMine((mine = next));
      const others = s.shareOthers
        ? ctx.room.members().flatMap((seat) => {
            const m = seat.m.sound;
            return !seat.self && m?.typing === true && isKind(m.noise) ? [m.noise] : [];
          })
        : [];
      const mixed = quiet() ? new Map<Kind, number>() : mix(next.typing ? kind : null, others);
      const gains = new Map([...mixed].map(([k, r]) => [k, (r * s.noiseVolume) / 100]));
      const key = JSON.stringify([...gains]);
      if (key === playing) return;
      playing = key;
      noise(gains);
    };

    update();
    ctx.settings.onChange(update);
    ctx.mode.on(update);
    ctx.room.onMembers(update);
    ctx.activity.on((sample) => {
      const t = sample.idleSec <= TYPING_IDLE_SEC;
      if (t === typing) return;
      typing = t;
      update();
    });

    // 채팅 알림음 (COM-03). 대화하기 창이 닫혀 있을 때 남의 메시지에만 울리고 회사원 모드에서는 울리지 않는다.
    // 설정에서 소리를 고르면 한 번 들려준다
    let chosen = settings().chatSound;
    ctx.settings.onChange(() => {
      const c = settings().chatSound;
      if (c === chosen) return;
      chosen = c;
      if (c !== 'off') chime(c);
    });
    ctx.bus.on('chat.heard', () => {
      const c = settings().chatSound;
      if (c !== 'off' && !quiet()) chime(c);
    });

    void upload(ctx);
    return {
      tracks: () => ctx.local.get<Playlist>('device').presets.flatMap((p) => p.tracks.map(({ v, title }) => ({ v, title }))),
      play: ({ v, title }) => {
        play(ctx, { k: `play:${v}`, v, title });
        ctx.ui.open(WINDOW);
      },
    };
  },
});
