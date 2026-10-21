import { describe, expect, it } from 'vitest';
import { formatTitle } from '../src/windowTitle';

// VSCODE-250.md W46: VS Code's window.title variables and separator handling.
describe('formatTitle', () => {
  const T = '${dirty}${activeEditorShort}${separator}${rootName}${separator}${appName}';
  it('fills the default template', () => {
    expect(formatTitle(T, { file: 'Steps/Auth.cs', root: 'C:\\repos\\shop' })).toBe('Auth.cs — shop — TestAuthoring Studio');
    expect(formatTitle(T, { file: 'Steps/Auth.cs', root: '/r/shop', dirty: true })).toBe('● Auth.cs — shop — TestAuthoring Studio');
  });
  it('drops separators next to empty values', () => {
    expect(formatTitle(T, { root: '/r/shop' })).toBe('shop — TestAuthoring Studio');
    expect(formatTitle(T, {})).toBe('TestAuthoring Studio');
  });
  it('uses the page when no file is open', () => {
    expect(formatTitle(T, { page: 'Test Generator', root: '/r/shop' })).toBe('Test Generator — shop — TestAuthoring Studio');
  });
  it('knows the path variables and a custom separator', () => {
    expect(formatTitle('${activeEditorMedium}${separator}${activeFolderShort}${separator}${rootPath}', { file: 'a/b/c.ts', root: '/r/shop' }, ' | ')).toBe('a/b/c.ts | b | /r/shop');
    expect(formatTitle('${activeEditorLong}', { file: 'a/c.ts', root: '/r/shop' })).toBe('/r/shop/a/c.ts');
  });
});
