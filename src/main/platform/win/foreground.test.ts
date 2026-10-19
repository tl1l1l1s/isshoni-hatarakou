import { describe, expect, it, vi } from 'vitest';

const activeWindow = vi.fn();
vi.mock('get-windows', () => ({ activeWindow }));
vi.mock('electron', () => ({ app: {}, screen: { screenToDipRect: (_w: unknown, r: unknown) => r } }));
const { win } = await import('./index');

const monitor = { x: 0, y: 0, width: 1920, height: 1080 };
const front = (path: string) => activeWindow.mockResolvedValueOnce({ owner: { path }, bounds: monitor });

describe('win.activeWindow', () => {
  it('바탕화면(explorer.exe)은 모니터를 꽉 채워도 영역을 넘기지 않아 전체 화면 앱으로 보지 않는다', async () => {
    front('C:\\Windows\\explorer.exe');
    expect(await win.activeWindow.foreground()).toEqual({ appKey: 'win:explorer.exe', unknownReason: null });
    front('C:\\Program Files\\VideoLAN\\VLC\\vlc.exe');
    expect(await win.activeWindow.foreground()).toEqual({ appKey: 'win:vlc.exe', unknownReason: null, bounds: monitor });
  });
});
