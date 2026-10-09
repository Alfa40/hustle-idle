# Hustle Idle — istruzioni per lo sviluppo

- Gioco idle per **telefono**, web app: Vite + TypeScript + Three.js, interfaccia HTML/CSS
  sopra la scena 3D. Design e stato dello sviluppo: `GDD.md`.
- **Layout: ogni schermata, nuova o modificata, deve seguire `LAYOUT.md`** (LayoutManager
  centrale in `src/ui/layout.ts`): verticale e orizzontale, scala in base al lato corto,
  safe area, niente `resize` o pixel fissi sparsi, prova con `debug.html` alle misure
  360×640, 390×844, 430×932, 768×1024 in entrambi gli orientamenti.
- **Mai coprire la visuale**: nessun riquadro, messaggio, avviso o fumetto deve stare sopra il personaggio,
  il campo da gioco attorno a lui e soprattutto gli obiettivi di un lavoretto o di un'attività. Tutto ciò che è
  testo va nella colonna in alto a sinistra (in orizzontale: pannello a sinistra), uno sotto l'altro:
  riquadri del gioco → fumetto del tutorial → scritta dell'azione. Unica eccezione: i messaggi a comparsa
  rapida (`.toasts`, uno alla volta, max 2 righe, pochi secondi) stanno al centro dello schermo, un po' sopra la
  metà (sopra il personaggio), mai sopra la colonna dei pulsanti. La camera inquadra il personaggio al centro della zona libera (città:
  `Game.centerInFreeArea`; stanze: `layout.freeRect` con tutti questi elementi tra gli occluder).
  Ogni nuovo elemento va aggiunto lì, mai a metà schermo.
- **Spazio giusto per la quantità di lavoro**: in ogni lavoretto, minigioco o attività lo spazio cresce
  insieme alle cose da fare (livello, ampliamenti). Sempre abbastanza per muoversi, mai così tanto che
  spostarsi diventa lungo: al livello 1 spazio piccolo e poche cose, poi entrambi salgono gradualmente
  (es. lotto dei minigiochi `lotSize()` in src/minigames/arena.ts).
- **Minigiochi nello stesso posto**: la scena di un lavoretto è separata dalla città, ma fuori dal lotto deve
  esserci il vero quartiere attorno al posto dove il lavoretto è stato accettato (stessa casa, stesse vie,
  case, palazzi, parchi): per il giocatore è lo stesso posto. Vale anche per l'interno delle attività
  (food truck nel suo parco, negozio dentro il suo palazzo): stesso codice, `buildSurroundings()` in
  src/world/surroundings.ts.
- **Scala del mondo**: le misure della città passano da `WS` (src/config/map.ts). Edifici, strade e distanze dalle tessere si moltiplicano per `WS`; personaggi, veicoli e oggetti di scena no. Nei lavoretti usare `frame()`/`zoneFor()` (già in scala).
- **Lavori e carriere**: ogni lavoretto è una linea in `src/config/careers.ts` (settore, nome, scala di
  carriera, `ready`); le versioni giocabili sono in `src/config/jobs.ts` (`JOBS` gradino base,
  `JOB_VARIANTS` ogni 10 livelli, `jobInfo()`). Livello del settore = somma dell'esperienza delle sue linee
  + lavoro nelle attività (`sectorXp` in src/sim/progress.ts). Nuovi lavori: si aggiungono lì, non altrove.
- Testi del gioco in italiano. Numeri da bilanciare in `src/config/`.
- Si pubblica (push su GitHub → GitHub Pages) solo quando l'utente scrive "Pusha"; ogni push
  va chiesto di nuovo. Dopo il push si aspetta che la GitHub Action finisca e si conferma il link.

## Flusso di lavoro con l'utente

- L'utente scrive in italiano e gioca **sul telefono**: le risposte sono in italiano, semplici.
- **Prima di chiedere "Pusha" si mandano sempre gli screenshot** (formato telefono, 390×844, e
  se serve anche in orizzontale) delle modifiche visive.
- A ogni modifica: commit locale (messaggio in italiano), aggiornare `GDD.md` (e `LAYOUT.md`
  se cambia il layout), `npm run build` senza errori.
- **Scorrimento**: nessun aggiornamento automatico (finestre `live`, soldi, incassi) deve far perdere dove
  l'utente ha scorso, né in verticale né nelle righe che scorrono di lato (schede, gruppi, carte).
  `renderPanel` lo garantisce per tutte le finestre (`keepScroll` in src/ui/ui.ts) e in sviluppo segnala in
  console `[scroll] posizione persa…`. Ogni nuova schermata con liste o righe scorrevoli va provata: scorri,
  aspetta un aggiornamento (es. cambia i soldi), controlla che la posizione resti uguale e che non ci siano
  errori `[scroll]`. Mai ridisegnare a mano un contenitore scorrevole senza salvare e rimettere lo scorrimento.
- Prove: headless con Chrome (puppeteer-core) che pilota `window.game` con script di prova
  usa-e-getta (non si salvano nel progetto). Prima di consegnare: giocare tutti e 6 i lavoretti
  fino alla fine, e per le schermate le misure di `LAYOUT.md`.

## Pubblicazione e servizi

- Gioco: repo pubblico `github.com/Alfa40/hustle-idle`, online su https://alfa40.github.io/hustle-idle/
  (GitHub Actions `.github/workflows/deploy.yml` a ogni push su `main`). Pagina di prova layout:
  `…/hustle-idle/debug.html`.
- Classifica, amici, logo e "sto giocando": server Node in `~/quartiere-ostile-3d-leaderboard/server.js`
  (repo `github.com/Alfa40/gioco-castello-antico-`, branch `main`), pubblicato su Render come
  `crazy-town.onrender.com` (si aggiorna da solo a ogni push) con database Upstash Redis.
  È condiviso con la classifica di "The Magic Trip": le chiavi di Hustle Idle iniziano con
  `hustle:` e non bisogna mai toccare quelle di Magic Trip. Account senza progressi da più di 30 giorni
  nascosti dalle classifiche, da più di 90 cancellati (dal server, ogni giorno). Le prove automatiche
  (browser pilotato, `navigator.webdriver`) non inviano niente alla classifica.
- Asset: modelli Kenney CC0 in `public/models` (zip completi in `assets-src/`, non pubblicati).
