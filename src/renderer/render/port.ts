// CharacterView: 모듈은 그리기 라이브러리를 부르지 않고 캐릭터를 데이터로만 넘긴다 (10.8.2).
import type { Appearance } from '@shared/schemas';

export interface Point { x: number; y: number }
export interface Anchors { head: Point; bubble: Point; nameplate: Point; deskTop: Point; feet: Point }
export interface Box { x: number; y: number; width: number; height: number }

/** 자세 그림 해시를 실제 그림으로 바꾸는 함수. 코어가 ctx.files로 만들어 넘긴다 */
export type ImageSource = (hash: string) => Promise<ImageBitmap | null>;

export interface ViewOptions {
  mode: 'stage' | 'preview';
  images: ImageSource;
  /** 그림이 없을 때 쓸 임시 자세 그림 */
  placeholder?: (pose: PoseId) => Promise<ImageBitmap>;
  /** 좌석 하나의 CSS 픽셀 크기. 기본 160x200 */
  size?: { width: number; height: number };
  /** anchor나 클릭 영역이 바뀌면 부른다 (기본 자세 그림을 받았을 때) */
  onGeometry?: () => void;
  /** 점 하나의 CSS 픽셀 크기. 주면 그만큼 낮은 해상도로 그리고 색 수를 줄인다 (SET-13) */
  pixel?: number;
}

export type PoseId = 'idle' | 'typing' | 'sleep';

export interface CharacterView {
  setAppearance(a: Appearance): void;
  /** characterStates의 id. backend에 없는 id는 idle로 그린다 */
  setState(stateId: string): void;
  setPosition(p: Point): void;
  setFacing(dir: 1 | -1): void;
  /** 로그만 남긴다. 효과는 코어의 효과 창이 그린다 (ctx.render.playEffect) */
  playEffect(effectId: string, seed: number): void;
  /** CSS 픽셀, 컨테이너 기준 */
  anchors(): Anchors;
  hitRegion(): Box;
  /** 캐릭터 몸을 숨기고 책상과 바닥만 남긴다 (효과로 자리를 떠나거나 다른 좌석에 올라탔을 때). reattach로 되돌린다 */
  detach(): void;
  reattach(): void;
  setFrameBudget(fps: number): void;
  dispose(): void;
}

export interface SceneSpec { appearance: Appearance; pose: PoseId; framing: 'face' | 'bust' | 'full' }

export interface RenderBackend {
  readonly id: 'debug' | 'canvas2d';
  createView(container: HTMLElement, opts: ViewOptions): CharacterView;
  renderScene(spec: SceneSpec, size: { width: number; height: number }, opts: ViewOptions): Promise<ImageBitmap>;
}
