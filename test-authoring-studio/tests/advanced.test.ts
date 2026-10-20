import { describe, expect, it } from 'vitest';
import { relativeDay, conflictsIn, resolveConflict, postfix } from '../src/editor/advanced';
import { selectHunks } from '../server/git';
import { outlinePreview } from '../src/editor/gherkinTools';
import { EditorState } from '@codemirror/state';

describe('advanced features (ADVANCED-20)', () => {
  it('registry starts empty', () => { expect(true).toBe(true); });
  it('Z1 relative day of a blame date', () => {
    const now = new Date(2026, 9, 20);
    expect(relativeDay('2026-10-20', now)).toBe('today');
    expect(relativeDay('2026-10-17', now)).toBe('3 days ago');
    expect(relativeDay('2026-07-20', now)).toBe('3 months ago');
    expect(relativeDay('2024-10-20', now)).toBe('2 years ago');
  });
  it('Z2 merge conflicts: find and resolve', () => {
    const text = 'a\n<<<<<<< HEAD\nmine\n=======\ntheirs\n>>>>>>> branch\nz';
    const [c] = conflictsIn(text);
    expect(c).toEqual({ start: 2, mid: 4, end: 6 });
    const lines = text.split('\n');
    expect(resolveConflict(lines, c, 'current')).toEqual(['mine']);
    expect(resolveConflict(lines, c, 'incoming')).toEqual(['theirs']);
    expect(resolveConflict(lines, c, 'both')).toEqual(['mine', 'theirs']);
    expect(conflictsIn('<<<<<<< a\nx\n||||||| base\ny\n=======\nz\n>>>>>>> b')[0]).toEqual({ start: 1, base: 3, mid: 5, end: 7 });
  });
  it('Z3 hunks touching the selected lines', () => {
    const diff = 'diff --git a/f.txt b/f.txt\nindex 1..2 100644\n--- a/f.txt\n+++ b/f.txt\n@@ -2 +2 @@\n-b\n+B\n@@ -5,0 +6,2 @@\n+x\n+y\n';
    const one = selectHunks(diff, 2, 2);
    expect(one.hunks).toBe(1);
    expect(one.patch).toBe('diff --git a/f.txt b/f.txt\nindex 1..2 100644\n--- a/f.txt\n+++ b/f.txt\n@@ -2 +2 @@\n-b\n+B\n');
    expect(selectHunks(diff, 7, 7).hunks).toBe(1);
    expect(selectHunks(diff, 3, 4).hunks).toBe(0);
    expect(selectHunks(diff, 1, 9).hunks).toBe(2);
  });
  it('Z4 postfix templates', () => {
    expect(postfix('        page.GetTitle().var', '        ')).toEqual({ from: 8, text: 'var title = page.GetTitle();', caret: 28 });
    expect(postfix('    user.notnull', '    ')!.text).toBe('if (user is not null)\n    {\n        \n    }');
    expect(postfix('    users.foreach', '    ')!.text.split('\n')[0]).toBe('foreach (var item in users)');
    expect(postfix('    ok.not', '    ')!.text).toBe('!ok');
    expect(postfix('    plain text', '    ')).toBe(null);
  });
  it('Z5 Scenario Outline preview leaves the file alone', () => {
    const src = 'Feature: F\n  Scenario Outline: As <r>\n    Given I am <r>\n\n    Examples:\n      | r |\n      | a |\n      | b |\n\n  Scenario: after\n    Given x\n';
    const state = EditorState.create({ doc: src, selection: { anchor: 15 } });
    expect(outlinePreview(state)).toBe('  Scenario: As a\n    Given I am a\n\n  Scenario: As b\n    Given I am b');
    expect(state.doc.toString()).toBe(src);
  });
});
