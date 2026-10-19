import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    // tre app: il gioco (index.html), l'app developer (developer.html: partita developer, anteprime, tester) e
    // l'app dei tester (tester.html: anteprime da provare e votare, proposte dei tester)
    rollupOptions: { input: { main: 'index.html', developer: 'developer.html', tester: 'tester.html' } },
  },
});
