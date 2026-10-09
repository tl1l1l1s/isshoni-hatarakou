import { app, Menu, nativeImage, Tray } from 'electron';
import { osName } from './platform';
import { resetPositions, toggle } from './windows/manager';

let tray: Tray | null = null; // 참조를 잃으면 트레이 아이콘이 사라진다

/** 임시 아이콘: 원 (BGRA, 미리 곱한 알파). 배율 100%, 150%, 200%용 16, 24, 32px을 함께 넣어 흐려지지 않게 한다.
 *  ponytail: 아이콘 그림이 생기면 build의 PNG로 바꾼다 */
function icon() {
  const img = nativeImage.createEmpty();
  for (const scaleFactor of [1, 1.5, 2]) {
    const s = 16 * scaleFactor;
    const r = (s * 7) / 16;
    const buf = Buffer.alloc(s * s * 4);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        // 가장자리 한 픽셀은 덮인 만큼만 칠한다
        const a = Math.min(1, Math.max(0, r + 0.5 - Math.hypot(x + 0.5 - s / 2, y + 0.5 - s / 2)));
        buf.set([0xf0 * a, 0xa0 * a, 0x60 * a, 0xff * a].map(Math.round), (y * s + x) * 4);
      }
    }
    img.addRepresentation({ scaleFactor, width: s, height: s, buffer: buf });
  }
  return img;
}

export function createTray(): void {
  tray = new Tray(icon());
  tray.setToolTip(app.getName());
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '보이기/숨기기', click: toggle },
      { label: '위치 초기화', click: resetPositions },
      { type: 'separator' },
      { label: '종료', click: () => app.quit() },
    ]),
  );
  // Windows 트레이는 왼쪽 클릭에 메뉴를 띄우지 않으므로 보이기와 숨기기를 바로 한다
  if (osName === 'win') tray.on('click', toggle);
}
