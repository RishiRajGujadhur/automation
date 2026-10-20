/** The window title: the page / file part (App) and a busy prefix while a build or a test run is going (QOL-50). */
let base = 'TestAuthoring Studio';
let busy = '';
const apply = () => { if (typeof document !== 'undefined') document.title = busy ? `${busy} · ${base}` : base; };
export function setBaseTitle(title: string) { base = title; apply(); }
export function setBusyTitle(text: string) { if (busy !== text) { busy = text; apply(); } }
