import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The Cloudflare plugin runs the Worker (worker/index.js) in Cloudflare's
// local runtime during `pnpm dev`, and builds the app and Worker together.
export default defineConfig({
  plugins: [react(), cloudflare()],
});
