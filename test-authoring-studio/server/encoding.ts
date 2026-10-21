import fs from 'node:fs/promises';

/**
 * File encodings (VSCODE-250.md W25 / W26): Reopen with Encoding and Save with Encoding, as in VS Code's status bar.
 * A UTF-8 byte order mark is kept on save but is not part of the editor's text.
 */
export const ENCODINGS = ['utf8', 'utf8bom', 'utf16le', 'utf16be', 'windows1252', 'iso88591'] as const;
export type Encoding = (typeof ENCODINGS)[number];

// Windows-1252's 0x80–0x9F (the rest matches ISO 8859-1).
const W1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';

/** The encoding a file's bytes suggest: a BOM, else UTF-8. */
export function detect(buf: Buffer): Encoding {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return 'utf8bom';
  if (buf[0] === 0xff && buf[1] === 0xfe) return 'utf16le';
  if (buf[0] === 0xfe && buf[1] === 0xff) return 'utf16be';
  return 'utf8';
}
export function decode(buf: Buffer, enc: Encoding): string {
  switch (enc) {
    case 'utf8': return buf.toString('utf8');
    // The byte order mark is not part of the text (VS Code hides it); saving in UTF-8 with BOM writes it again.
    case 'utf8bom': return buf.toString('utf8').replace(/^\uFEFF/, '');
    case 'utf16le': return new TextDecoder('utf-16le').decode(buf);
    case 'utf16be': return new TextDecoder('utf-16be').decode(buf);
    case 'iso88591': return buf.toString('latin1');
    case 'windows1252': return [...buf].map((b) => (b >= 0x80 && b <= 0x9f ? W1252[b - 0x80] : String.fromCharCode(b))).join('');
  }
}
export function encode(text: string, enc: Encoding): Buffer {
  switch (enc) {
    case 'utf8': return Buffer.from(text.replace(/^\uFEFF/, ''), 'utf8');
    case 'utf8bom': return Buffer.from(text.startsWith('\uFEFF') ? text : '\uFEFF' + text, 'utf8');
    case 'utf16le': return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text.replace(/^\uFEFF/, ''), 'utf16le')]);
    case 'utf16be': { const le = Buffer.from(text.replace(/^\uFEFF/, ''), 'utf16le'); for (let i = 0; i + 1 < le.length; i += 2) { const t = le[i]; le[i] = le[i + 1]; le[i + 1] = t; } return Buffer.concat([Buffer.from([0xfe, 0xff]), le]); }
    case 'iso88591': return Buffer.from(text.replace(/^\uFEFF/, ''), 'latin1');
    case 'windows1252': return Buffer.from([...text.replace(/^\uFEFF/, '')].map((c) => { const i = W1252.indexOf(c); if (i >= 0) return 0x80 + i; const code = c.charCodeAt(0); return code < 256 ? code : 0x3f; }));
  }
}
/** A file's text in the given (or detected) encoding. */
export async function readText(file: string, enc?: Encoding) {
  const buf = await fs.readFile(file);
  const encoding = enc ?? detect(buf);
  return { text: decode(buf, encoding), encoding };
}
