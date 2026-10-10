import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ConfirmProvider, PrefsProvider, TooltipProvider } from './radix2';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PrefsProvider>
      <TooltipProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </TooltipProvider>
    </PrefsProvider>
  </React.StrictMode>,
);
