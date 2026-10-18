/**
 * Line separators (Rider's status bar CRLF / LF). The editor works in "\n" (CodeMirror's model); the file keeps its
 * own separator, applied when the text goes to disk — before this, CRLF files became LF on their first save.
 */
export type Eol = '\r\n' | '\n';
/** CRLF only when every line break of the text is one (mixed files are saved with LF). */
export const eolOf = (text: string): Eol => (text.includes('\r\n') && !/(^|[^\r])\n/.test(text) ? '\r\n' : '\n');
export const toLF = (text: string) => text.replace(/\r\n/g, '\n');
export const withEol = (text: string, eol: Eol) => (eol === '\r\n' ? toLF(text).replace(/\n/g, '\r\n') : toLF(text));

/** CRLF ⇄ LF requests from the status bar / Edit menu, for the editor of a file. */
export const SET_EOL_EVENT = 'tas:set-eol';
export const requestEol = (file: string, eol: Eol) => window.dispatchEvent(new CustomEvent(SET_EOL_EVENT, { detail: { file, eol } }));
