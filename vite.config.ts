import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    // due app: il gioco (index.html) e l'app developer (developer.html: partita developer, anteprime, tester)
    rollupOptions: { input: { main: 'index.html', developer: 'developer.html' } },
  },
});
