import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { diff as diffMode } from '@codemirror/legacy-modes/mode/diff';
import { useEditorTheme } from '../themes';
import { useLocalState } from '../ui';
import { featureOn } from '../features';
import SideBySide from './SideBySide';

const SETUP = { foldGutter: false, autocompletion: false };
const EXTENSIONS = [StreamLanguage.define(diffMode)];

/** Compare with Clipboard (Rider): the selection (or the file) against the clipboard, as a unified diff or side by side. */
export default function CompareClipboard({ patch, what, against = 'the clipboard' }: { patch: string; what: string; against?: string }) {
  const theme = useEditorTheme();
  const [layout, setLayout] = useLocalState<'unified' | 'side'>('diffLayout', 'unified');
  const added = patch.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
  const removed = patch.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---')).length;
  const other = against === 'the clipboard' ? 'Clipboard' : against;
  const side = layout === 'side' && featureOn('diff-side-by-side');
  return (
    <div className="compare-clipboard">
      <p className="subtle" role="status">{patch ? `${what} vs. ${against === 'the clipboard' ? 'clipboard' : against}: ${removed} line${removed === 1 ? '' : 's'} only in ${what.toLowerCase()}, ${added} only in ${against}.` : `${what} and ${against} are identical.`}</p>
      {patch && featureOn('diff-side-by-side') && (
        <div className="segmented-mini" role="radiogroup" aria-label="Diff layout">
          <button role="radio" aria-checked={!side} onClick={() => setLayout('unified')}>Unified</button>
          <button role="radio" aria-checked={side} onClick={() => setLayout('side')}>Side by Side</button>
        </div>
      )}
      {patch && (side ? <SideBySide patch={patch} left={what} right={other} /> : <CodeMirror value={patch} theme={theme} editable={false} basicSetup={SETUP} extensions={EXTENSIONS} height="50vh" aria-label="Differences" />)}
    </div>
  );
}
