import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages under any repo path.
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 1000 },
});
