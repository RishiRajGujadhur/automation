import type { Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { sass } from '@codemirror/lang-sass';
import { less } from '@codemirror/lang-less';

/** Front-end files (FRONTEND-100.md): scripts go to the TypeScript service, markup and styles to the HTML / CSS ones. */
export const SCRIPT_FILE = /\.(tsx?|jsx?|mjs|cjs|mts|cts)$/i;
export const HTML_FILE = /\.(html?|htm|xhtml|vue|svelte)$/i;
export const STYLE_FILE = /\.(css|scss|sass|less)$/i;
export const isWebFile = (f: string) => SCRIPT_FILE.test(f) || HTML_FILE.test(f) || STYLE_FILE.test(f);

/** CodeMirror's language for a front-end file: syntax colouring, folding, indentation, bracket matching. */
export function webLanguage(file: string): Extension[] {
  const f = file.toLowerCase();
  if (SCRIPT_FILE.test(f)) return [javascript({ typescript: /\.(tsx?|mts|cts)$/.test(f), jsx: /\.(tsx|jsx|js)$/.test(f) })];
  // Closing tags as you type `>` or `</` (FRONTEND-100.md F54).
  if (HTML_FILE.test(f)) return [html({ autoCloseTags: true })];
  if (f.endsWith('.scss')) return [sass({ indented: false })];
  if (f.endsWith('.sass')) return [sass({ indented: true })];
  if (f.endsWith('.less')) return [less()];
  if (f.endsWith('.css')) return [css()];
  return [];
}
