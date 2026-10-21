import { registerCustom, type Context } from '../tsActions.js';
import { hookProblems } from '../hooksLint.js';

// F47 Apply React Hook dependency fixes: the dependency array exhaustive-deps suggests, for the problem at the caret.
const fixAt = (c: Context) => hookProblems(c.file, c.text).filter((p) => p.from <= c.to && p.to >= c.from).flatMap((p) => p.fixes)[0];
registerCustom({
  name: 'hook-dependencies',
  offer: (c) => fixAt(c)?.title,
  apply: (c) => { const f = fixAt(c)!; return c.text.slice(0, f.from) + f.text + c.text.slice(f.to); },
});
