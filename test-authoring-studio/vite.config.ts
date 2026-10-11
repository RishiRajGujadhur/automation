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
    // The sample repository lives inside the project: editing it from the studio must not reload the page.
    watch: { ignored: ['**/scanner/bin/**', '**/scanner/obj/**', '**/.local/**', '**/fixtures/**', '**/test-results/**'] },
    proxy: { '/api': `http://127.0.0.1:${apiPort}` },
  },
});
