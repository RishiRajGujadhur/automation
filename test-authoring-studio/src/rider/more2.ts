import type { RiderCommand } from './commands';
import type { MoreHelpers } from './more';
import { urlEncode, urlDecode } from '../editor/textTools2';

/**
 * Fourth batch of Visual Studio 2026 / JetBrains Rider commands (IDE-FEATURES-4.md, Y1–Y100). RiderHost registers
 * them with the same helpers as the third batch; each command's feature switch is in src/features.ts.
 */
export function moreCommands2(h: MoreHelpers): RiderCommand[] {
  return [
    { id: 'url-encode', label: 'URL Encode', menu: 'Edit', submenu: 'Convert', run: h.inEditor((v) => urlEncode(v) || h.notice('Select text (or put the caret on a word) to convert.')) },
    { id: 'url-decode', label: 'URL Decode', menu: 'Edit', submenu: 'Convert', run: h.inEditor((v) => urlDecode(v) || h.notice('Select text (or put the caret on a word) to convert.')) },
  ];
}
