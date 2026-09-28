import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './ui/style.css';
import { Game } from './game';
import { UI } from './ui/ui';
import { TitleScreen } from './ui/title';

async function boot() {
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

  // accesso da console per i test
  (window as unknown as { game: Game }).game = game;

  // schermata iniziale: si entra in partita solo dopo aver scelto lo slot
  const title = new TitleScreen((slot, newName) => {
    title.hide();
    game.begin(slot, newName);
    game.ui = new UI(game);
    if (!game.state.tutorialDone) game.ui.openWelcome();
    else if (game.offlineReport) game.ui.openOffline(game.offlineReport);
    game.ui.refresh();
  });
  (window as unknown as { title: TitleScreen }).title = title;
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('loading')!.innerHTML = `<p style="padding:20px">Errore di caricamento: ${e?.message ?? e}</p>`;
});
