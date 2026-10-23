import { describe, expect, it } from 'vitest';
import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { css } from '@codemirror/lang-css';
import { webSnippetCompletion } from '../src/editor/web/webSnippets';
import { resetSetting, setSetting } from '../src/vscode/settings';

describe('frontend snippet discovery', () => {
  it('waits for two typed characters but allows explicit completion after one', () => {
    const state = EditorState.create({ doc: 'fl', extensions: [css()] });
    const oneCharacter = new CompletionContext(state, 1, false);
    const twoCharacters = new CompletionContext(state, 2, false);
    const explicit = new CompletionContext(state, 1, true);

    expect(webSnippetCompletion('layout.css', oneCharacter)).toBeNull();
    expect(webSnippetCompletion('layout.css', twoCharacters)?.options.some((item) => item.label === 'flexc')).toBe(true);
    expect(webSnippetCompletion('layout.css', explicit)?.options.some((item) => item.label === 'flexc')).toBe(true);
  });

  it('uses the configured automatic prefix length', () => {
    setSetting('editor.frontendSnippets.minPrefixLength', 3);
    try {
      const state = EditorState.create({ doc: 'fle', extensions: [css()] });
      expect(webSnippetCompletion('layout.css', new CompletionContext(state, 2, false))).toBeNull();
      expect(webSnippetCompletion('layout.css', new CompletionContext(state, 3, false))?.options.some((item) => item.label === 'flexc')).toBe(true);
    } finally {
      resetSetting('editor.frontendSnippets.minPrefixLength');
    }
  });
});
