import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readSettings } from './server/settings';

// Ports come from .local/settings.json (Settings → Ports) or STUDIO_WEB_PORT / STUDIO_API_PORT.
const { webPort, apiPort } = readSettings();
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: webPort,
    strictPort: true,
    watch: { ignored: ['**/scanner/bin/**', '**/scanner/obj/**', '**/.local/**'] },
    proxy: { '/api': `http://127.0.0.1:${apiPort}` },
  },
});
