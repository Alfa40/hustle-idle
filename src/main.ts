// le anteprime delle proposte dei tester (sito a parte): fuori dalla classifica
import './preview';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './ui/style.css';
import { Game } from './game';
import { UI } from './ui/ui';
import { TitleScreen } from './ui/title';
import { showInstallTip } from './ui/install';
import { preloadLogo } from './logo';
import { checkDevLink, DEV_SLOT } from './dev';
import { checkTesterLink } from './tester';
import { watchIcons } from './ui/icons';

async function boot() {
  // niente emoji: ogni emoji nella pagina diventa un'icona disegnata del gioco
  watchIcons();
  // link segreto della modalità developer (solo sul telefono dello sviluppatore, vedi src/dev.ts)
  await checkDevLink();
  // link segreto dei tester: aggiunge solo la scheda "Proponi" nelle Opzioni (vedi src/tester.ts)
  await checkTesterLink();
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const bar = document.getElementById('loadbar')!;
  // il font serve già per le scritte 3D disegnate su canvas
  await Promise.race([document.fonts.load('600 20px Fredoka'), new Promise((r) => setTimeout(r, 1500))]);
  const game = new Game(canvas);
  await game.init((f) => (bar.style.width = `${Math.round(f * 100)}%`));
  game.start();

  const loading = document.getElementById('loading')!;
  loading.style.opacity = '0';
  setTimeout(() => loading.remove(), 400);
  // aperto dal browser: consiglio di aggiungerlo alla schermata Home
  showInstallTip();

  // accesso da console per i test
  (window as unknown as { game: Game }).game = game;

  // schermata iniziale: si entra in partita solo dopo aver scelto lo slot
  const title = new TitleScreen((slot, newName) => {
    title.hide();
    game.begin(slot, newName);
    // partita developer nuova: un miliardo, niente tutorial di benvenuto
    if (slot === DEV_SLOT && newName !== undefined) {
      game.state.money = 1_000_000_000;
      game.state.dev = true;
      game.state.tutorialDone = true;
      game.save();
    }
    game.ui = new UI(game);
    // nome e logo prima di tutto (ogni volta finché non sono stati scelti); il resto aspetta in coda
    if (game.ui.needsIdentity()) game.ui.openLogoEditor(true);
    if (!game.state.tutorialDone) game.ui.openWelcome();
    else if (game.offlineReport) game.ui.openOffline(game.offlineReport);
    game.ui.refresh();
    // la foto del logo (se c'è) si decodifica subito: profilo e classifica la mostrano
    void preloadLogo(game.state.logo).then(() => game.ui.refresh());
  });
  (window as unknown as { title: TitleScreen }).title = title;
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('loading')!.innerHTML = `<p style="padding:20px">Errore di caricamento: ${e?.message ?? e}</p>`;
});
