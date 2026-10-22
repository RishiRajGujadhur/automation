import { useEffect, useState } from 'react';
import { useTabs, activateTab } from '../files/tabs';
import { fileType } from '../files/fileTypes';
import { unsavedFiles, UNSAVED_EVENT } from '../editor/autosave';
import { SAVE_ALL_EVENT } from '../editor/events';
import { CLOSE_EDITOR_EVENT } from '../quickinput/editors';
import { openLocation } from '../quickinput/providers';
import ViewPane from './ViewPane';

/** W54 Open Editors (VS Code's Explorer section): every open editor, unsaved ones marked, close / Save All / Close All. */
export default function OpenEditors() {
  const { tabs, active } = useTabs();
  const [dirty, setDirty] = useState(unsavedFiles);
  useEffect(() => { const h = () => setDirty(unsavedFiles()); window.addEventListener(UNSAVED_EVENT, h); return () => window.removeEventListener(UNSAVED_EVENT, h); }, []);
  const close = (f: string) => window.dispatchEvent(new CustomEvent(CLOSE_EDITOR_EVENT, { detail: f }));
  return (
    <ViewPane id="open-editors" title="Open Editors" count={tabs.length} actions={[
      { icon: 'save-all', title: 'Save All', run: () => window.dispatchEvent(new Event(SAVE_ALL_EVENT)) },
      { icon: 'close-all', title: 'Close All Editors', run: () => tabs.filter((t) => !t.pinned).forEach((t) => close(t.file)) },
    ]}>
      <ul className="open-editors" aria-label="Open Editors">
        {tabs.map((t) => {
          const type = fileType(t.file);
          const name = t.file.split('/').pop()!;
          const dir = t.file.includes('/') ? t.file.slice(0, t.file.lastIndexOf('/')) : '';
          const unsaved = dirty.includes(t.file);
          return (
            <li key={t.file} className={`open-editor${t.file === active ? ' active' : ''}${t.preview ? ' preview' : ''}`} title={t.file}>
              <button className={`icon-button open-editor-close${unsaved ? ' dirty' : ''}`} aria-label={`Close ${name}`} title="Close Editor" onClick={() => close(t.file)}><span className={`codicon codicon-${unsaved ? 'circle-filled' : 'close'}`} aria-hidden="true" /></button>
              <button className="open-editor-name" onClick={() => { activateTab(t.file); openLocation(t.file); }}>
                <type.icon size={14} style={{ color: type.color }} aria-hidden="true" />
                <span>{name}</span>
                {dir && <small>{dir}</small>}
              </button>
            </li>
          );
        })}
      </ul>
    </ViewPane>
  );
}
