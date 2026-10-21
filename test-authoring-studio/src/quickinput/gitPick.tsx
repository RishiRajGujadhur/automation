import { api } from '../api';
import { openInputBox, openQuickPick, type QuickItem } from './store';

type Branches = { local: { name: string; current: boolean; upstream?: string; when: string }[]; remote: string[]; tags?: string[] };
const notice = (m: string) => window.dispatchEvent(new CustomEvent('tas:notice', { detail: m }));
const icon = (name: string) => <span className={`codicon codicon-${name}`} aria-hidden="true" />;
// A Git ref name: no spaces, "..", control characters or the characters Git refuses.
const badRef = (n: string) => (!n.trim() ? 'Please provide a branch name' : /\s|\.\.|[~^:?*[\\]|@\{|\/$|\.lock$|^[-/.]|\/\//.test(n) ? `Branch name "${n}" is not valid` : undefined);

async function checkout(name: string, create = false) {
  try { await api('/git/checkout', { name, create }); notice(create ? `Created and switched to ${name}.` : `Switched to ${name}.`); window.dispatchEvent(new Event('tas:git-changed')); }
  catch (e) { notice((e as Error).message); }
}

/** Git: Create Branch… (an input box with VS Code's validation). */
export function createBranch() {
  openInputBox({ placeholder: 'Branch name', prompt: 'Please provide a new branch name', validate: badRef, accept: (n) => void checkout(n.trim(), true) });
}

/** W33 Git: Checkout to… (the status bar's branch): create a branch, or pick a branch, remote branch or tag. */
export async function checkoutTo() {
  let b: Branches = { local: [], remote: [] };
  try { b = await api<Branches>('/git/branches'); } catch (e) { notice((e as Error).message); return; }
  const items: QuickItem[] = [
    { id: 'create', label: 'Create new branch...', icon: icon('plus'), accept: () => setTimeout(createBranch) },
    ...b.local.map((x, i) => ({ id: `b:${x.name}`, label: x.name, description: [x.current ? 'current' : '', x.when].filter(Boolean).join(' · '), icon: icon('git-branch'), separator: i === 0 ? 'branches' : undefined, accept: () => { if (!x.current) void checkout(x.name); } })),
    ...b.remote.map((x, i) => ({ id: `r:${x}`, label: x, description: 'Remote branch', icon: icon('cloud'), separator: i === 0 ? 'remote branches' : undefined, accept: () => void checkout(x) })),
    ...(b.tags ?? []).map((x, i) => ({ id: `t:${x}`, label: x, description: 'Tag', icon: icon('tag'), separator: i === 0 ? 'tags' : undefined, accept: () => void checkout(x) })),
  ];
  openQuickPick({ placeholder: 'Select a branch or tag to checkout', items });
}
