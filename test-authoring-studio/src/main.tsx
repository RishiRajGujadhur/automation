import React from 'react';
import { createRoot } from 'react-dom/client';
import '@vscode/codicons/dist/codicon.css';
import App from './App';
import FloatingEditor, { floatingFile } from './FloatingEditor';
import { ConfirmProvider, PrefsProvider, TooltipProvider } from './radix2';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PrefsProvider>
      <TooltipProvider>
        <ConfirmProvider>
          {/* A floating editor window shows one file alone (RIDER-VSCODE-FEATURES.md 387). */}
          {floatingFile(location.hash) ? <FloatingEditor file={floatingFile(location.hash)!} /> : <App />}
        </ConfirmProvider>
      </TooltipProvider>
    </PrefsProvider>
  </React.StrictMode>,
);
