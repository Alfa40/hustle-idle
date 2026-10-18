import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    // due pagine: il gioco e il lanciatore delle anteprime (anteprime.html)
    rollupOptions: { input: { main: 'index.html', anteprime: 'anteprime.html' } },
  },
});
