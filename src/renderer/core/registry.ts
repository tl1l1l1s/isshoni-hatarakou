import type { BubbleDecl, CommandDecl, ContributionDecl, Ctx, Dispose, ShortcutDecl, WindowDecl, CharacterStateDecl } from './types';
import { createStore } from './store';

interface Owned<T> { owner: string; ctx: Ctx; decl: T }

/** 모듈이 선언한 명령, 슬롯 항목, 창, 단축키, 자세를 모은다. 모듈을 내리면 그 모듈 항목이 함께 빠진다 */
export class Registry {
  readonly commands = new Map<string, Owned<CommandDecl>>();
  readonly windows = new Map<string, Owned<WindowDecl>>();
  readonly contributions = createStore<Array<Owned<ContributionDecl>>>([]);
  readonly shortcuts: Array<Owned<ShortcutDecl>> = [];
  readonly characterStates: Array<Owned<CharacterStateDecl>> = [];
  readonly bubbles: Array<Owned<BubbleDecl>> = [];
  /** 지금 숨길 슬롯 항목 (표시 모드와 gate). runtime이 정한다 */
  hidden: (c: ContributionDecl) => boolean = () => false;
  /** 지금 막힌 명령의 이유 (표시 모드와 gate). runtime이 정한다 */
  blocked: (c: CommandDecl) => string | null = () => null;

  add(owner: string, ctx: Ctx, m: {
    commands?: CommandDecl[]; windows?: WindowDecl[]; contributions?: ContributionDecl[];
    shortcuts?: ShortcutDecl[]; characterStates?: CharacterStateDecl[]; bubbles?: BubbleDecl[];
  }): Dispose {
    for (const c of m.commands ?? []) this.commands.set(c.id, { owner, ctx, decl: c });
    for (const w of m.windows ?? []) this.windows.set(w.id, { owner, ctx, decl: w });
    this.contributions.set((xs) => [...xs, ...(m.contributions ?? []).map((decl) => ({ owner, ctx, decl }))]);
    this.shortcuts.push(...(m.shortcuts ?? []).map((decl) => ({ owner, ctx, decl })));
    this.characterStates.push(...(m.characterStates ?? []).map((decl) => ({ owner, ctx, decl })));
    this.characterStates.sort((a, b) => b.decl.priority - a.decl.priority);
    this.bubbles.push(...(m.bubbles ?? []).map((decl) => ({ owner, ctx, decl })));
    this.bubbles.sort((a, b) => b.decl.priority - a.decl.priority);
    return () => this.remove(owner);
  }

  remove(owner: string): void {
    for (const [k, v] of this.commands) if (v.owner === owner) this.commands.delete(k);
    for (const [k, v] of this.windows) if (v.owner === owner) this.windows.delete(k);
    this.contributions.set((xs) => xs.filter((x) => x.owner !== owner));
    for (const list of [this.shortcuts, this.characterStates, this.bubbles] as Array<Array<Owned<unknown>>>) {
      for (let i = list.length - 1; i >= 0; i--) if (list[i]!.owner === owner) list.splice(i, 1);
    }
  }

  async run(id: string, args?: unknown): Promise<unknown> {
    const c = this.commands.get(id);
    if (!c) throw new Error(`없는 명령입니다: ${id}`);
    const reason = this.reason(id, args);
    if (reason) throw new Error(reason);
    return c.decl.run(c.ctx, args);
  }

  reason(id: string, args?: unknown): string | null {
    const c = this.commands.get(id);
    if (!c) return `없는 명령입니다: ${id}`;
    return this.blocked(c.decl) ?? c.decl.enabledWhen?.(c.ctx, args) ?? null;
  }

  /** 슬롯에 보일 항목을 순서대로. 표시 모드나 gate로 숨긴 항목은 뺀다 */
  slot(slot: string): Array<Owned<ContributionDecl>> {
    return this.contributions.get().filter((x) => x.decl.slot === slot && !this.hidden(x.decl)).sort((a, b) => (a.decl.order ?? 0) - (b.decl.order ?? 0));
  }

  /** 표시 모드나 gate가 바뀌었을 때 슬롯을 다시 그리게 한다 */
  refresh(): void {
    this.contributions.set((xs) => [...xs]);
  }
}
