import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { violation } from './check-imports';

const f = (p: string) => resolve(import.meta.dirname, '../src/modules', p);

describe('check-imports', () => {
  it('같은 모듈, shared, core 타입, 다른 모듈 api는 허용한다', () => {
    expect(violation(f('gacha/index.ts'), './logic')).toBeNull();
    expect(violation(f('gacha/ui/A.tsx'), '../logic')).toBeNull();
    expect(violation(f('gacha/index.ts'), '@shared/codes')).toBeNull();
    expect(violation(f('gacha/index.ts'), '@core/types')).toBeNull();
    expect(violation(f('gacha/index.ts'), '@modules/focus/api')).toBeNull();
  });
  it('다른 모듈 내부와 코어 구현과 Electron은 막는다', () => {
    expect(violation(f('gacha/index.ts'), '../focus/logic')).toMatch(/다른 모듈/);
    expect(violation(f('gacha/index.ts'), '@core/runtime')).toMatch(/모듈 밖/);
    expect(violation(f('gacha/index.ts'), 'electron')).toMatch(/모듈 밖/);
    expect(violation(f('gacha/index.ts'), '@modules/focus/logic')).toMatch(/모듈 밖/);
  });
});
