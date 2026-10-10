import { EditorView } from '@codemirror/view';

/**
 * Accessible name for a CodeMirror instance (WCAG 4.1.2). Read-only editors also become keyboard
 * focusable so their scroll region can be operated without a mouse (WCAG 2.1.1).
 */
export const labelled = (label: string, readOnly = false) =>
  EditorView.contentAttributes.of({ 'aria-label': label, tabindex: '0', ...(readOnly ? { 'aria-readonly': 'true' } : {}) });
