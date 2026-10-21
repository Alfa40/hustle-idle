import { defineConfig, type Plugin } from 'vite';

/** numero della versione: cambia a ogni build (il gioco lo confronta con version.json per sapere se ce n'è una nuova) */
const BUILD = String(Date.now());

/** version.json accanto al gioco: lo legge src/update.ts (senza cache) */
const versionFile = (): Plugin => ({
  name: 'hustle-version',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) });
  },
});

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [versionFile()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    // tre app: il gioco (index.html), l'app developer (developer.html: partita developer, anteprime, tester) e
    // l'app dei tester (tester.html: anteprime da provare e votare, proposte dei tester)
    rollupOptions: { input: { main: 'index.html', developer: 'developer.html', tester: 'tester.html' } },
  },
});
