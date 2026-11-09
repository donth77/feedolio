import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The Cloudflare plugin runs the Worker (worker/index.js) in Cloudflare's
// local runtime during `pnpm dev`, and builds the app and Worker together.
export default defineConfig({
  plugins: [react(), cloudflare()],
  environments: {
    client: {
      build: {
        rolldownOptions: {
          output: {
            // Everything the first page loads goes in one chunk. Left to its own
            // heuristics, the bundler splits shared code into many small chunks
            // once a lazy page (search, say) shares it, which costs kilobytes of
            // compression on the first page. Lazy pages still load on their own.
            codeSplitting: { groups: [{ name: 'app', tags: ['$initial'] }] },
          },
        },
      },
    },
  },
  server: {
    watch: {
      // Generated output. Watching it made every coverage run reload the page
      // hundreds of times.
      ignored: ['**/coverage/**', '**/dist/**', '**/test-results/**', '**/playwright-report/**'],
    },
  },
});
