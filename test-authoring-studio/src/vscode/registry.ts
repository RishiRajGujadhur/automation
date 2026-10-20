import { Compartment, type Extension } from '@codemirror/state';

/**
 * Editor extensions driven by VS Code–style settings. Each feature registers a factory that reads its settings; the
 * code and Gherkin editors include them (through viewOptionsExtension) and rebuild them when a setting changes.
 */
const factories: (() => Extension)[] = [];
const compartments: Compartment[] = [];
export function settingsExtension(f: () => Extension) { factories.push(f); compartments.push(new Compartment()); }
export const settingsExtensions = () => factories.map((f, i) => compartments[i].of(f()));
export const settingsReconfigure = () => factories.map((f, i) => compartments[i].reconfigure(f()));
