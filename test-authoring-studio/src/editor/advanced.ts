import type { Extension } from '@codemirror/state';

/**
 * Advanced Visual Studio 2026 / Rider editor features (ADVANCED-20.md, Z1–Z20). Each registers a factory here; the code
 * and Gherkin editors include them all. A factory returns [] for files (or editors) it does not apply to.
 */
export type EditorKind = 'code' | 'gherkin';
const factories: ((file: string, kind: EditorKind) => Extension)[] = [];
export const registerAdvanced = (f: (file: string, kind: EditorKind) => Extension) => { factories.push(f); };
export const advancedEditor = (file: string, kind: EditorKind): Extension[] => factories.map((f) => f(file, kind));
