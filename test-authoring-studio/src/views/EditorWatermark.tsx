import { Keybinding } from '../quickinput/QuickInput';
import { openCommandPalette, openQuickOpen } from '../quickinput/providers';
import { runRider } from '../rider/commands';
import { defineSetting, useSettings } from '../vscode/settings';

/** workbench.tips.enabled (VSCODE-250.md W61): the empty editor area's watermark with its key tips. */
export const tipsEnabled = defineSetting<boolean>({ key: 'workbench.tips.enabled', category: 'Workbench', title: 'Tips: Enabled', type: 'boolean', default: true, description: 'When enabled, will show the watermark tips when no editor is open.' });

const TIPS: { label: string; keys: string; run: () => void }[] = [
  { label: 'Show All Commands', keys: 'Ctrl+Shift+P', run: () => openCommandPalette() },
  { label: 'Go to File', keys: 'Ctrl+P', run: () => openQuickOpen() },
  { label: 'Find in Files', keys: 'Ctrl+Shift+F', run: () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true, bubbles: true })) },
  { label: 'Toggle Terminal', keys: 'Ctrl+`', run: () => runRider('tool-terminal', 'menu') },
  { label: 'Open View', keys: 'Ctrl+Q', run: () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', ctrlKey: true, bubbles: true })) },
];

/** W61 VS Code's empty editor group: a letterpress mark and the most useful keys. */
export default function EditorWatermark() {
  useSettings();
  return (
    <div className="editor-watermark" aria-label="Editor watermark" role="region">
      <div className="watermark-letterpress" aria-hidden="true">TA</div>
      {tipsEnabled() && (
        <dl className="watermark-tips">
          {TIPS.map((t) => (
            <div key={t.label} className="watermark-tip">
              <dt><button onClick={t.run}>{t.label}</button></dt>
              <dd><Keybinding keys={t.keys} /></dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
