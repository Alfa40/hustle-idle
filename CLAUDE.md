# Hustle Idle — istruzioni per lo sviluppo

- Gioco idle per **telefono**, web app: Vite + TypeScript + Three.js, interfaccia HTML/CSS
  sopra la scena 3D. Design e stato dello sviluppo: `GDD.md`.
- **Layout: ogni schermata, nuova o modificata, deve seguire `LAYOUT.md`** (LayoutManager
  centrale in `src/ui/layout.ts`): verticale e orizzontale, scala in base al lato corto,
  safe area, niente `resize` o pixel fissi sparsi, prova con `debug.html` alle misure
  360×640, 390×844, 430×932, 768×1024 in entrambi gli orientamenti.
- **Al chiuso c'è il soffitto**: ogni lavoretto dentro un palazzo (`Room`, src/minigames/room.ts) ha soffitto, muri alti fino al soffitto e plafoniere: dal soffitto non si deve mai vedere il cielo (regola dell'utente, 24/10/2026).
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
  Le scene dei lavoretti per settore: src/minigames/logistics.ts, hospitality3d.ts, manual3d.ts (Costruzione),
  art3d.ts (Arte, design e ristrutturazione), con i minigiochi col dito in station.ts, kitchen.ts, handstations.ts e
  artstations.ts; si avviano da `buildRun` in src/game.ts (`start…Job`).
- **Lavoretti sempre "con le mani"** a ogni gradino (guidare, caricare, consegnare…): la gestione di persone,
  mezzi e turni sta **solo nelle attività**. Le attività nuove **non si sbloccano col livello**: si compra
  un'attività base e, ampliandola e migliorandola, si evolve in un'altra (albero con bivi, vedi `CARRIERE.md`).
- **Spiegazioni dietro il "?"**: nelle finestre ogni testo che spiega come funziona qualcosa (descrizioni,
  regole, consigli, note "come si calcola") ha la classe `explain` (o si scrive con `explain(...)` in src/ui/ui.ts)
  e resta nascosto finché non si tocca il tasto **?** nell'intestazione. Restano visibili solo dati, stati,
  avvisi e i pulsanti. Vale per ogni finestra nuova.
- **Testi brevi, a punti**: niente paragrafi lunghi. Una spiegazione è un elenco di frasi corte (≈ 60 caratteri
  ciascuna): in src/ui/ui.ts `points(...)` (dietro il "?") e `bullets(...)` (sempre visibile), classe `points`.
  Consigli dei resoconti e messaggi: una riga sola, con il numero e cosa fare. I `tip` dei lavoretti si scrivono a
  frasi brevi separate da punto.
- **Tutorial dei lavoretti: un passo alla volta** (src/ui/jobtutorial.ts). Il fumetto dice solo il passo di adesso
  (niente "?" con la lista di tutto) e la freccia indica il passo **consigliato** (`RunGuide.next`: tra le scelte quella
  giusta, `right`, mai il punto più vicino se è sbagliato). Quando arriva un tipo di passo nuovo, una frase a schermo
  scuro ("👉 Ora: …"); all'inizio di una fase il suo nome (o `TIPS`, o il `tip` se è breve) e le sue `rules` (regole che i
  passi non dicono da soli, una frase per passo); un `Task.tip` si dice quando quel passo arriva. Ogni minigioco col dito
  (`Station`) ha il suo **mini tutorial**: `guideSteps()` per ogni momento (`guideKey()`, es. lavello: spugna → sapone →
  macchie, poi il risciacquo), con il punto da toccare acceso. Ogni postazione nuova deve averli.
- **Guida obbligatoria per ogni tasto o funzione nuova** (`src/ui/guide.ts`, passi in `src/ui/guides.ts`): ogni finestra
  nuova ha un nome `guide` nel pannello e i suoi passi in `guides.ts` (`panel:<nome>`, `<nome>/tab:<scheda>`, `<nome>/<azione>`);
  ogni tasto nuovo fuori dalle finestre o funzione che si sblocca ha la sua guida (`hud:…`, `unlock:…` con `auto`). Una frase
  corta per passo, che dice dove toccare e per fare cosa (mai un testo lungo nel fumetto). Se servono punti da indicare, dare
  agli elementi un `data-g="…"`. Ogni emoji delle frasi deve avere il disegno in iconart.ts. I tutorial dei lavoretti e della
  cucina sono obbligatori la prima volta.
- **Nomi unici e account** (`src/sim/account.ts`, server `hustle-account.js`): il nome del giocatore si cambia solo con
  `chooseName()` (controlla sul server che sia libero), mai scrivendo direttamente `hustle.nickname`. Il salvataggio
  sul server (`cloudSave`) parte da `game.save()`; se si aggiungono dati del giocatore in localStorage da portare su un
  altro telefono, vanno in `SAVE_KEYS`. Chiavi del server solo `hustle:name…`, `hustle:acct…`, `hustle:save…`, `hustle:sess…`.
- **Domanda dei prodotti**: la scheda Mercato di un prodotto (fattori e previsione a 7 giorni) è in `src/sim/market.ts` e rifà
  le regole di `marketDemand` (economy.ts) e di `newDay` (calendar.ts): se cambia come si calcola la domanda, aggiornare anche lì.
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
  l'impronta SHA-256, `?dev=off` la spegne. Nell'app per giocare aggiunge solo il tasto 📝 sullo schermo con le schede "📝 Proponi" e "📮 Da approvare".
- **App developer** (`developer.html`, src/devapp.ts), separata dal gioco: Partita developer (`./?app=dev`, slot 9, un
  miliardo, scheda "🛠️ Developer" nelle Opzioni con comandi rapidi; mai in classifica né in "sto giocando"), anteprime
  e tester; ogni anteprima si accetta ("Accetta e pubblica": il robot `proposte.yml` la unisce in main e pubblica) o si
  rifiuta da lì. Ogni comando nuovo utile ai test va aggiunto nella scheda Developer.
- **App tester** (`tester.html`, src/testerapp.ts): chiave tester + nome; anteprime viste come nell'app developer (stessa
  scheda), senza partita developer né Accetta/Rifiuta/modifiche: solo il consiglio 👍 Pubblicala / 👎 Scartala con commento
  (solo un parere, decide lo sviluppatore) e resoconti dei tester. Codice in comune con l'app developer in src/board.ts
  (avvisi "In preparazione", resoconti con solo rifiutate e nel gioco). Proposta poco chiara: etichetta `chiarimento` sulla
  issue e domanda nel testo tra `<!-- domanda -->` e `<!-- /domanda -->`: nelle app compare "❓ Serve un chiarimento"
  con il riquadro per rispondere (risposte in `notes`, server `vote: "nota"`; il robot le passa a Claude: `answers` di
  `/tochange`, claude.yml input `risposta`, conferma `/answered`). claude.yml unisce main al ramo prima di Claude (conflitti: li risolve Claude). Se all'accettazione proposte.yml trova conflitti, lancia da solo claude.yml con la richiesta di aggiornare il ramo.
  Toccando un'anteprima si apre la sua scheda (src/board.ts `detailHtml`): voti e commenti, "Cosa cambia" da GitHub;
  nell'app developer "Modifiche da fare" (`request_changes` → robot → `claude.yml` con `richiesta`, stesso ramo) e i tasti.
  Sotto ogni consiglio dei tester con commento c'è "📨 Manda a Claude" (`sendTip` in src/devapp.ts): stessa strada di
  `request_changes`, con il commento del tester (`votesBlock(..., extra)` in src/board.ts).
- **Modalità tester** (src/tester.ts): link segreto `?tester=<chiave>` (o chiave in Crediti), solo l'impronta nel
  codice, `?tester=off` la spegne. Non cambia niente della partita: aggiunge solo il tasto 📝 Proponi sullo schermo
  (src/ui/proposals.ts). Le proposte vanno al server (private) e lo sviluppatore le approva nella scheda "📮 Da approvare" della stessa finestra (nelle Opzioni le proposte non ci sono più);
  solo le approvate diventano issue su GitHub con Claude al lavoro (`.github/workflows/proposte.yml`, GDD §12b).
  Claude ne prepara **una alla volta** (etichetta `in-coda`, il robot riparte alla fine di ogni `claude.yml`); il server
  sveglia subito il robot alle decisioni dello sviluppatore (`GH_DISPATCH_TOKEN` su Render: token stretto, solo Actions del repo del gioco).
  Tasto Proponi sempre sullo schermo (`.prop-fab`, `UI.openPropose`: finestra `top` sopra anche ai tavoli). Si sposta tenendolo premuto (`movableFab` in ui.ts, posizione in localStorage `hustle.propFab`).
  Autista: pedali e frecce (`JobRide.pedals`, `Game.drivePedals`, `Game.pedalInput`, src/ui/pedals.ts; `Input.pedals` spegne joystick e azioni).
- **Anteprime** (`src/preview.ts`): sito a parte `proposta-N.hustle-anteprime.pages.dev`, fuori classifica, con nome e logo
  già pronti, "Gioca subito" e Partita developer. L'app developer le elenca tutte. **Ogni proposta che cambia una parte
  precisa del gioco ha il suo `src/anteprime/<numero>.json`** (src/previewStart.ts): il tester parte subito nella situazione
  della modifica (`soldi`, `possiede`, poi `veicolo`, `lavoretto`+`gradino`, `attivita`+`scheda`, `apri` o `sfida` con
  tavolo di prova e bot). "Gioca l'anteprima" nelle app apre `?subito`: niente menu, dritti lì.

- **Multigiocatore** (pulsante 🎮 Sfide): minigiochi contro gli amici per categoria; categoria Casinò con poker (`src/ui/poker.ts`, server
  `hustle-poker.js` nel repo della classifica, chiavi `hustle:poker:…`) e blackjack contro il banco (`src/ui/blackjack.ts`,
  `hustle-blackjack.js`, chiavi `hustle:bj:…`, vincite nella stessa lista `hustle:poker:cash:…`). Lobby comune `openCasino(kind)`. Il server decide tutto (mazzo, turni, regole);
  le fiches si tolgono dal conto entrando e tornano uscendo (vincite da ritirare per slot). Al tavolo la partita è
  offline (`Game.enterAway`/`leaveAway`). Prove: bot contro il server con Upstash finto e più telefoni simulati.

## Pubblicazione e servizi

- Gioco: repo pubblico `github.com/Alfa40/hustle-idle`, online su https://alfa40.github.io/hustle-idle/
  (GitHub Actions `.github/workflows/deploy.yml` a ogni push su `main`). Pagina di prova layout:
  `…/hustle-idle/debug.html`.
- **Versione di prova (beta)**: ramo `beta`, pubblicato da `.github/workflows/beta.yml` su Cloudflare Pages (stesso progetto delle anteprime) a https://beta.hustle-anteprime.pages.dev. Sito a parte: salvataggi suoi; `betaSite`/`sandbox` in src/preview.ts lo tengono fuori da classifica, account e poker vero, con la partita developer sempre disponibile. Le modifiche grosse da far provare vanno lì (commit sul ramo `beta`, push solo con "Pusha"); `main` resta il gioco vero. In locale si prova con `?beta`. Oggi contiene i campi di carriera (GDD §6b).
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
- Attività: per ora **tutte automatiche** (`ALL_AUTO` / `isAutoType` in src/config/business.ts, `isAutoBiz` in sim/economy.ts): niente interni, niente ordini di persona, personale (un dipendente per reparto + manager) assunto all'apertura. Non cancellare il codice degli interni (food truck, panificio): è solo nascosto.

- Punti "da passare col dito" nei lavoretti 3D: `Task.sweep(a, b)` con `aim` (jobs.ts). Riceve il tratto percorso dal dito sulla zona `aim` e restituisce quanto è fatto (0–1); col dito fermo non avanza. Esempio: i mucchietti di sporco dell'aspirapolvere (`dustPile` in manual3d.ts). Niente riquadro: si fa nella scena.
- Locali con l'interno (food truck, panificio): col locale grande (ampliamento 2) ci devono stare TUTTI i fuochi e banchi extra (`extraRoom` in src/config/recipes.ts, controllo in fondo al file). L'evoluzione chiede tutte le migliorie al massimo: se manca parete, l'attività resta bloccata per sempre.
- Posti in vendita: `SPECIAL` (posizione nella pianta, righe/colonne relative alla città originale, anche negative) + `LOTS` (nome, prezzo, affitto) in src/config/map.ts. Ogni posto ha un carattere unico (non usare quelli dei modelli: h H b B R t V A M p . #). Negozi su una cella `b` (riga in basso di un isolato m/C/c), posteggi sulla `p` degli isolati T/S. Gli id non si cambiano mai (sono nei salvataggi).
- Terreni e palazzi: dati in src/config/plots.ts (`PLOTS`, `WORKS`, `SIZES`), regole in src/sim/plots.ts (stato ricavato dai minuti di gioco), disegno in src/world/plotview.ts, `Game.setupPlot`. I piani sono lotti `terrenoN-pK`: per qualsiasi posto usare sempre `lotDef()` / `allLots(s)` (economy.ts), mai `LOTS` direttamente, così valgono anche i piani dei palazzi.
- Fama, crisi e imprevisti: numeri in `FAME`, `CRISIS` e `TROUBLES` (src/config/balance.ts); crisi/fallimento/pignoramento in src/sim/crisis.ts, notizie (tasto 📰 Notizie) con `addNews` in src/sim/news.ts, imprevisti in src/sim/troubles.ts (solo col gioco aperto, effetti con `troubleCap`/`rivalMult` in economy.ts). Ogni nuova cosa che fa perdere o guadagnare soldi o fama va scritta anche come notizia.
