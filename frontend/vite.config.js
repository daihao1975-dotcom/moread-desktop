import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export default defineConfig({
  plugins: [
    {
      name: 'moread-bootstrap-csp',
      transformIndexHtml(html) {
        const source = readFileSync(new URL('./src/frame-bootstrap.js', import.meta.url), 'utf8');
        const hash = createHash('sha256').update(source, 'utf8').digest('base64');
        return html.replace('sha256-MOREAD_FRAME_BOOTSTRAP_HASH', 'sha256-' + hash);
      },
    },
  ],
  build: { sourcemap: false, chunkSizeWarningLimit: 1600 },
});
