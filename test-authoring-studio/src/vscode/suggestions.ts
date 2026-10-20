import { ViewPlugin, type EditorView } from '@codemirror/view';
import { acceptCompletion, closeCompletion, completionStatus, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { defineSetting } from './settings';
import { settingsExtension } from './registry';

/** Suggestions (VS Code's Text Editor ▸ Suggestions): when IntelliSense opens by itself and which keys accept it. */
const C = 'Text Editor ▸ Suggestions';
export const suggest = {
  quick: defineSetting<boolean>({ key: 'editor.quickSuggestions', category: C, title: 'Quick Suggestions', type: 'boolean', default: true, description: 'Controls whether suggestions should automatically show up while typing (Ctrl+Space always shows them).' }),
  delay: defineSetting<number>({ key: 'editor.quickSuggestionsDelay', category: C, title: 'Quick Suggestions Delay', type: 'number', default: 10, min: 0, max: 5000, description: 'Controls the delay in milliseconds after which quick suggestions will show up.' }),
  trigger: defineSetting<boolean>({ key: 'editor.suggestOnTriggerCharacters', category: C, title: 'Suggest On Trigger Characters', type: 'boolean', default: true, description: 'Controls whether suggestions should automatically show up when typing trigger characters (the "." of a member access).' }),
  enter: defineSetting<'on' | 'smart' | 'off'>({
    key: 'editor.acceptSuggestionOnEnter', category: C, title: 'Accept Suggestion On Enter', type: 'enum', default: 'on', description: 'Controls whether suggestions should be accepted on Enter, in addition to Tab. Helps to avoid ambiguity between inserting new lines or accepting suggestions.',
    options: [{ value: 'on' }, { value: 'smart', description: 'Only accept a suggestion with Enter when it makes a textual change.' }, { value: 'off' }],
  }),
  tab: defineSetting<'on' | 'off'>({ key: 'editor.tabCompletion', category: C, title: 'Tab Completion', type: 'enum', default: 'on', description: 'Enables tab completions: Tab accepts the selected suggestion.', options: [{ value: 'on' }, { value: 'off' }] }),
};

/** Whether a completion source may run now: explicit requests always; typing per the settings. */
export function suggestAllowed(explicit: boolean, before: string, o = { quick: suggest.quick(), trigger: suggest.trigger() }) {
  if (explicit) return true;
  return /[.<]/.test(before) ? o.trigger : o.quick;
}
type Source = (ctx: CompletionContext) => CompletionResult | null | Promise<CompletionResult | null>;
/** Wraps an IntelliSense source with editor.quickSuggestions, its delay and editor.suggestOnTriggerCharacters. */
export function gateSource(source: Source): Source {
  return async (ctx) => {
    const word = ctx.matchBefore(/[\w@]*/);
    const before = ctx.state.sliceDoc(Math.max(0, (word?.from ?? ctx.pos) - 1), word?.from ?? ctx.pos);
    if (!suggestAllowed(ctx.explicit, before)) return null;
    const ms = suggest.delay();
    if (!ctx.explicit && ms > 10) { await new Promise((r) => setTimeout(r, ms)); if (ctx.aborted) return null; }
    return source(ctx);
  };
}
/** The completion keys run first (capture phase), before CodeMirror's own keymap. */
function keys(view: EditorView) {
  return (e: KeyboardEvent) => {
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || completionStatus(view.state) !== 'active') return;
    if (e.key === 'Enter' && suggest.enter() === 'off') closeCompletion(view);
    else if (e.key === 'Tab' && suggest.tab() === 'off') closeCompletion(view);
    else if (e.key === 'Tab' && suggest.tab() === 'on' && acceptCompletion(view)) { e.preventDefault(); e.stopPropagation(); }
  };
}
settingsExtension(() => ViewPlugin.fromClass(class {
  h: (e: KeyboardEvent) => void;
  constructor(readonly view: EditorView) { this.h = keys(view); view.dom.addEventListener('keydown', this.h, true); }
  destroy() { this.view.dom.removeEventListener('keydown', this.h, true); }
}));
