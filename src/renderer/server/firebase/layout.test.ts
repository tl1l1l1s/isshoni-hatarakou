import { describe, expect, it } from 'vitest';
import { WRITE_DENIED, writeError } from './layout';

describe('writeError', () => {
  it('set의 code와 transaction의 message 모두 거부로 보고 원래 오류는 cause에 남긴다', () => {
    const set = Object.assign(new Error('PERMISSION_DENIED: Permission denied'), { code: 'PERMISSION_DENIED' });
    const tx = new Error('permission_denied');
    for (const e of [set, tx]) expect(writeError(e)).toMatchObject({ message: WRITE_DENIED, code: 'PERMISSION_DENIED', cause: e });
  });

  it('그 밖의 실패는 인터넷 연결 안내이고 code는 그대로다', () => {
    const e = Object.assign(new Error('DISCONNECT'), { code: 'DISCONNECT' });
    expect(writeError(e)).toMatchObject({ message: '저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.', code: 'DISCONNECT', cause: e });
    expect(writeError(new Error('maxretry')).message).not.toBe(WRITE_DENIED);
  });
});
