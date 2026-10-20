import { EditorSelection, Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { featureOn } from '../features';

/** Markdown / text editing comforts (QOL-50 QL51–QL56), for .md, .markdown and .txt files. */
/** Markdown and text files wrap long lines (VS Code's Markdown default). */
// markdown qol
export const markdownQol: Extension[] = [...(featureOn('md-wrap') ? [EditorView.lineWrapping] : []), ];
