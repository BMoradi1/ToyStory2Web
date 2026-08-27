import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173 },
  // The game install is deliberately outside the served tree — assets are read
  // through the browser's file APIs from wherever the user keeps them, never
  // served by us. See CLAUDE.md.
});
