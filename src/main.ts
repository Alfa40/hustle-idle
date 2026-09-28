import './ui/style.css';
import { Game } from './game';
import { UI } from './ui/ui';

async function boot() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const bar = document.getElementById('loadbar')!;
  const game = new Game(canvas);
  await game.init((f) => (bar.style.width = `${Math.round(f * 100)}%`));
  game.ui = new UI(game);
  game.start();

  const loading = document.getElementById('loading')!;
  loading.style.opacity = '0';
  setTimeout(() => loading.remove(), 400);

  if (!game.state.tutorialDone) game.ui.openWelcome();
  else if (game.offlineReport) game.ui.openOffline(game.offlineReport);
  game.ui.refresh();

  // accesso da console per i test
  (window as unknown as { game: Game }).game = game;
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('loading')!.innerHTML = `<p style="padding:20px">Errore di caricamento: ${e?.message ?? e}</p>`;
});
