# Hustle Idle — istruzioni per lo sviluppo

- Gioco idle per **telefono**, web app: Vite + TypeScript + Three.js, interfaccia HTML/CSS
  sopra la scena 3D. Design e stato dello sviluppo: `GDD.md`.
- **Layout: ogni schermata, nuova o modificata, deve seguire `LAYOUT.md`** (LayoutManager
  centrale in `src/ui/layout.ts`): verticale e orizzontale, scala in base al lato corto,
  safe area, niente `resize` o pixel fissi sparsi, prova con `debug.html` alle misure
  360×640, 390×844, 430×932, 768×1024 in entrambi gli orientamenti.
- **Riquadro dei lavoretti essenziale**: nel badge in alto solo quello che serve davvero al player in quel
  momento (es. i civici dove consegnare, la camera della valigia in mano); niente informazioni inutili o
  secondarie (numero della fase, cose già visibili in scena, ripetizioni).
- **Niente vignette fluttuanti** (etichette o fumetti sospesi sopra oggetti, case, porte) se non richiesto
  espressamente: numeri e nomi stanno fisicamente sugli oggetti (targhe sui muri, sulle porte, etichette sulle
  scatole).
- **Niente emoji**: icone e immagini disegnate apposta, in linea con la grafica del gioco (canvas/SVG o modelli),
  adattate alle esigenze del lavoretto o dell'attività. Sistema già pronto: ogni carattere emoji nel codice viene
  mostrato col disegno di `src/ui/iconart.ts` (HTML in automatico, canvas con `fillTextIco`); un'icona nuova va
  disegnata lì, e nei canvas non si usa `fillText` diretto per testi con icone.
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
- **Durata massima 5 minuti**: ogni lavoretto o minigioco, anche al livello più alto, si finisce in **meno di
  5 minuti** (il tempo a disposizione non supera mai 5 minuti; chi gioca bene finisce in 2–3). La difficoltà
  cresce con la **densità** (cose più difficili, tempi più stretti, imprevisti) e non con la quantità: quando arriva
  una meccanica nuova, le cose da fare restano le stesse o diminuiscono. Gli imprevisti **sostituiscono** un passo,
  non se ne aggiungono, e al massimo uno o due per partita.
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
- **Lavoretti sempre "con le mani"** a ogni gradino (guidare, caricare, consegnare…): la gestione di persone,
  mezzi e turni sta **solo nelle attività**. Le attività nuove **non si sbloccano col livello**: si compra
  un'attività base e, ampliandola e migliorandola, si evolve in un'altra (albero con bivi, vedi `CARRIERE.md`).
- **Spiegazioni dietro il "?"**: nelle finestre ogni testo che spiega come funziona qualcosa (descrizioni,
  regole, consigli, note "come si calcola") ha la classe `explain` (o si scrive con `explain(...)` in src/ui/ui.ts)
  e resta nascosto finché non si tocca il tasto **?** nell'intestazione. Restano visibili solo dati, stati,
  avvisi e i pulsanti. Vale per ogni finestra nuova.
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
  console `[scroll] posizione persa…`. Anche tornando con "‹ Indietro" la finestra è dove l'avevi lasciata
  (`Panel.scroll`); chiudendo tutto e tornando a giocare si riparte dall'inizio. Ogni nuova schermata con liste o righe scorrevoli va provata: scorri,
  aspetta un aggiornamento (es. cambia i soldi), controlla che la posizione resti uguale e che non ci siano
  errori `[scroll]`. Mai ridisegnare a mano un contenitore scorrevole senza salvare e rimettere lo scorrimento.
- Prove: headless con Chrome (puppeteer-core) che pilota `window.game` con script di prova
  usa-e-getta (non si salvano nel progetto). Prima di consegnare: giocare fino alla fine tutti i lavoretti
  dei settori accesi (ogni gradino), e per le schermate le misure di `LAYOUT.md`. Per i lavoretti 3D non basta
  completare i punti da codice: va provato il **tocco vero sullo schermo** (touchscreen) su ogni punto, la
  **raggiungibilità** camminando (griglia con le collisioni del gioco) e una foto dall'alto per le sovrapposizioni.

- **Telefono dello sviluppatore** (src/dev.ts): acceso col link segreto `?dev=<chiave>` o scrivendo la chiave in
  Crediti dopo 7 tocchi su "Versione" (l'app sulla Home su iPhone ha la memoria separata da Safari); nel codice c'è solo
  l'impronta SHA-256, `?dev=off` la spegne. Nell'app per giocare aggiunge solo le schede "📝 Proponi" e "📮 Proposte".
- **App developer** (`developer.html`, src/devapp.ts), separata dal gioco: Partita developer (`./?app=dev`, slot 9, un
  miliardo, scheda "🛠️ Developer" nelle Opzioni con comandi rapidi; mai in classifica né in "sto giocando"), anteprime
  e tester; ogni anteprima si accetta ("Accetta e pubblica": il robot `proposte.yml` la unisce in main e pubblica) o si
  rifiuta da lì. Ogni comando nuovo utile ai test va aggiunto nella scheda Developer.
- **App tester** (`tester.html`, src/testerapp.ts): chiave tester + nome; anteprime da provare con voto 👍/👎 e commento
  (solo un parere, decide lo sviluppatore) e resoconti dei tester. Codice in comune con l'app developer in src/board.ts
  (avvisi "In preparazione", resoconti con solo rifiutate e nel gioco). Proposta poco chiara: etichetta `chiarimento` sulla
  issue e domanda nel testo tra `<!-- domanda -->` e `<!-- /domanda -->`: nelle app compare "❓ Serve un chiarimento"
  con il riquadro per rispondere (risposte in `notes`, server `vote: "nota"`).
- **Modalità tester** (src/tester.ts): link segreto `?tester=<chiave>` (o chiave in Crediti), solo l'impronta nel
  codice, `?tester=off` la spegne. Non cambia niente della partita: aggiunge solo la scheda "📝 Proponi" nelle Opzioni
  (src/ui/proposals.ts). Le proposte vanno al server (private) e lo sviluppatore le approva nella scheda "📮 Proposte";
  solo le approvate diventano issue su GitHub con Claude al lavoro (`.github/workflows/proposte.yml`, GDD §12b).
- **Anteprime** (`src/preview.ts`): sito a parte `proposta-N.hustle-anteprime.pages.dev`, fuori classifica, con nome e logo
  già pronti, "Gioca subito" e Partita developer. L'app developer le elenca tutte. **Ogni proposta che cambia una parte
  precisa del gioco ha il suo `src/anteprime/<numero>.json`** (src/previewStart.ts): "Gioca subito" parte già lì
  (`veicolo`, `lavoretto`+`gradino`, `attivita`, più `cosa` e `soldi`).

- **Multigiocatore** (pulsante 🎮 Sfide): minigiochi contro gli amici per categoria; categoria Casinò con poker (`src/ui/poker.ts`, server
  `hustle-poker.js` nel repo della classifica, chiavi `hustle:poker:…`) e blackjack contro il banco (`src/ui/blackjack.ts`,
  `hustle-blackjack.js`, chiavi `hustle:bj:…`, vincite nella stessa lista `hustle:poker:cash:…`). Lobby comune `openCasino(kind)`. Il server decide tutto (mazzo, turni, regole);
  le fiches si tolgono dal conto entrando e tornano uscendo (vincite da ritirare per slot). Al tavolo la partita è
  offline (`Game.enterAway`/`leaveAway`). Prove: bot contro il server con Upstash finto e più telefoni simulati.

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
- Asset: modelli Kenney CC0 in `public/models` (zip completi in `assets-src/`, non pubblicati). Licenze di terze parti
  (three.js MIT, Fredoka OFL, Kenney CC0) in `public/LICENSES.txt`, linkato dai Crediti: ogni libreria, font o asset
  nuovo va aggiunto lì e nei Crediti. Niente marchi, nomi o grafiche di aziende o giochi reali.
