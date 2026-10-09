// backend 고르기 (10.8.2). 모듈은 이 파일이 아니라 CharacterView port만 본다.
import type { RenderBackend } from './port';
import { canvas2dBackend } from './canvas2d';
import { debugBackend } from './debug';

export const getBackend = (id: RenderBackend['id']): RenderBackend => (id === 'debug' ? debugBackend : canvas2dBackend);
