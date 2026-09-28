import { defineConfig } from 'vite';

// Relative Pfade, damit der Build auch unter einem Unterpfad (z. B. GitHub Pages) läuft
export default defineConfig({
  base: './',
  server: { host: true },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
