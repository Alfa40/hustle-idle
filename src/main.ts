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
import { checkDevLink, DEV_SLOT, devApp } from './dev';
import { loadState, seasonReset } from './sim/state';
import { checkTesterLink } from './tester';
import { claimPoker } from './ui/poker';
import { previewPr } from './preview';
import { syncLogo } from './identity';
import { applyPreviewStart, previewNow, previewStart } from './previewStart';
import { nickname, setNickname } from './sim/leaderboard';
import { watchIcons } from './ui/icons';
import { startUpdateCheck } from './update';

/** Hustle Idle spento per il momento: al posto del menu c'è un avviso che manda a Hustler Town */
const GAME_OFF = true;
const HUSTLER_TOWN = 'https://hustler-town.pages.dev';

async function boot() {
  // niente emoji: ogni emoji nella pagina diventa un'icona disegnata del gioco
  watchIcons();
  // reset di tutte le partite (una volta sola per telefono): si riparte scegliendo la carriera
  const wasReset = seasonReset();
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
  // versione nuova pubblicata: si aggiorna da solo (vedi src/update.ts)
  startUpdateCheck({
    canReload: (resumed) => {
      // schermata iniziale: subito; in partita solo tornando nel gioco e se non si sta facendo nulla di importante
      if (!game.ui) return true;
      return resumed && !game.run && !game.interior && !game.house && !document.body.classList.contains('in-poker') && !game.ui.guide.active;
    },
    beforeReload: () => {
      if (game.ui) game.save();
    },
  });

  // accesso da console per i test
  (window as unknown as { game: Game }).game = game;

  const start = (slot: number, newName?: string, quick = false) => {
    game.begin(slot, newName);
    // il logo è del giocatore, uguale in tutte le partite (src/identity.ts)
    syncLogo(game.state);
    // partita developer nuova: un miliardo, niente tutorial di benvenuto
    if (slot === DEV_SLOT && newName !== undefined) {
      game.state.money = 1_000_000_000;
      game.state.dev = true;
      game.state.tutorialDone = true;
      game.save();
    }
    // anteprima di una proposta: nome e logo già pronti, si gioca subito (il logo è quello casuale della partita)
    if (previewPr !== null) {
      if (!nickname()) setNickname(`Prova ${previewPr}`);
      game.state.logoChosen = true;
    }
    // "Gioca subito" in un'anteprima: niente benvenuto, si va dritti alla parte cambiata (se c'è il suo file)
    const jump = previewStart && quick ? previewStart : null;
    if (previewPr !== null && quick) {
      game.state.tutorialDone = true;
      game.state.guidesOff = true;
      // si prova la modifica con tutti i campi aperti (niente scelta del campo)
      game.state.fields = undefined;
    }
    game.ui = new UI(game);
    // nome e logo prima di tutto (ogni volta finché non sono stati scelti); il resto aspetta in coda
    if (!devApp && game.ui.needsIdentity()) game.ui.openLogoEditor(true);
    // la prima volta parte da sola la guida di benvenuto (src/ui/guides.ts, `start`), appena il gioco è libero
    if (game.state.tutorialDone && game.offlineReport) game.ui.openOffline(game.offlineReport);
    game.ui.refresh();
    if (jump) applyPreviewStart(game, jump);
    // fiches del poker rimaste sul server (app chiusa al tavolo, stanza chiusa mentre eri via): tornano sul conto
    void claimPoker(game);
    // la foto del logo (se c'è) si decodifica subito: profilo e classifica la mostrano
    void preloadLogo(game.state.logo).then(() => game.ui.refresh());
  };

  // app developer (developer.html → ./?app=dev): subito la partita developer, senza menu iniziale
  if (devApp) {
    start(DEV_SLOT, loadState(DEV_SLOT) ? undefined : '🛠️ Developer');
    return;
  }
  // anteprima aperta da "Gioca l'anteprima" nelle app (?subito): niente menu, una partita nuova già nella situazione
  // della modifica (ricaricando la pagina riparte da capo; "torna al menu" toglie ?subito e porta al menu dell'anteprima)
  if (previewNow) {
    start(1, `Anteprima #${previewPr}`, true);
    return;
  }
  // schermata iniziale: si entra in partita solo dopo aver scelto lo slot
  const title = new TitleScreen((slot, newName, quick) => {
    title.hide();
    start(slot, newName, quick);
  });
  (window as unknown as { title: TitleScreen }).title = title;
  // Hustle Idle è spento per il momento: un avviso copre il menu e manda a Hustler Town (l'app developer resta aperta)
  if (GAME_OFF) {
    const n = document.createElement('div');
    n.className = 'off-note';
    n.innerHTML = `<div class="off-box"><div class="off-title">AVVISO</div><p>Per il momento <b>Hustle Idle è spento</b>.</p><p>Da adesso si gioca a <b>Hustler Town</b>: entra dal link qui sotto.</p><a class="btn good off-go" href="${HUSTLER_TOWN}">Gioca a Hustler Town</a><div class="off-link">${HUSTLER_TOWN.replace('https://', '')}</div></div>`;
    document.body.appendChild(n);
    return;
  }
  // le partite di prima sono state azzerate: si dice perché (una volta sola)
  if (wasReset) {
    const n = document.createElement('div');
    n.className = 'season-note';
    n.innerHTML = '<b>🆕 Hustle Idle è cambiato!</b><br>Ora si sceglie una carriera e si cresce passo passo: tutte le partite e gli account ripartono da zero. Nome e logo restano.<br><button class="btn good" style="margin-top:10px">Ok, ricomincio</button>';
    document.body.appendChild(n);
    n.querySelector('button')!.addEventListener('click', () => n.remove());
  }
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('loading')!.innerHTML = `<p style="padding:20px">Errore di caricamento: ${e?.message ?? e}</p>`;
});
