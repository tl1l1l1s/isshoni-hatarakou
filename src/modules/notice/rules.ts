// mod/notice 규칙 조각 (ACC-09, OPS-18). 글과 확성기는 선물하는 사람의 스크립트(관리 SDK)만 쓰고 앱은 읽기만 한다
import type { RuleNode, Templates } from '../../../rules/core.ts';

export default (t: Templates): RuleNode => {
  const anyone = { '.read': t.ownerWritePublicRead()['.read']! };
  return {
    g: { posts: anyone, shout: anyone },
    u: { $uid: { mail: { '.read': t.owner()['.read']! } } },
  };
};
