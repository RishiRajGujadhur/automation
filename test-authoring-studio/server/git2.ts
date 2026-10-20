import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { git, locate } from './git.js';

/* Git features of RIDER-VSCODE-FEATURES.md (commit templates, compare commits, squash / interactive rebase, worktrees,
   bisect). Each runs git in the repository that holds the workspace folder. */

/** Commit message template: git's commit.template, else .gitmessage at the top of the repository. */
export async function commitTemplate(root: string): Promise<{ text: string; source: string } | null> {
  const { top } = await locate(root);
  const configured = (await git(top, ['config', '--get', 'commit.template']).catch(() => '')).trim();
  const candidates = configured ? [configured.replace(/^~(?=[\/])/, os.homedir())] : [];
  candidates.push('.gitmessage');
  for (const c of candidates) {
    const file = path.isAbsolute(c) ? c : path.join(top, c);
    const text = await fs.readFile(file, 'utf8').catch(() => null);
    if (text !== null) return { text: text.replace(/\r\n/g, '\n'), source: configured && c !== '.gitmessage' ? `commit.template (${configured})` : '.gitmessage' };
  }
  return null;
}
