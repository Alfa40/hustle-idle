# Sistema di layout di Hustle Idle

Il gioco si usa sul telefono **sia in verticale sia in orizzontale** (e su tablet).
Ogni schermata deve adattarsi da sola quando il telefono ruota, senza deformazioni,
parti tagliate, elementi sotto il notch o perdita di stato.
**Tutto passa dal LayoutManager centrale**: questo file sono le regole da seguire
anche per ogni schermata nuova.

## Il LayoutManager (`src/ui/layout.ts`)

`import { layout, frameRoom } from './ui/layout'`

- `layout.info`: `w`, `h`, `orientation` (`portrait`/`landscape`), `short`, `long`,
  `device` (`small` < 375 px di lato corto, `phone`, `tablet` ≥ 600 px), `scale`
  (lato corto / 390, tra 0,86 e 1,35), `safe` (notch, isola dinamica, barra Home, in px).
- `layout.on((info, prev) => …)`: unico modo per reagire a rotazione e ridimensionamento.
  Chiama subito una volta, poi a ogni cambio: un aggiornamento immediato (la scena non si
  deforma) e uno a rotazione finita (debounce 140 ms). Restituisce la funzione per smettere:
  chiamarla quando la schermata si chiude.
- `layout.freeRect([{ sel, dock }])`: la parte di schermo non coperta dall'interfaccia indicata,
  meno la safe area. Ogni elemento toglie il lato `dock` (`top`, `left`, `right`, `bottom`); senza
  `dock`, il lato che fa perdere meno spazio. Non scavalca mai l'interfaccia (solo se resta meno
  del 25% dello schermo si accetta di coprire un po' la scena).
- `frameRoom(camera, free, stanza, inclinazione)`: inquadra una stanza 3D al centro della zona
  libera senza deformarla: misura gli angoli veri della stanza sullo schermo (prospettiva compresa),
  corregge distanza e centratura (`setViewOffset`). Se la stanza intera verrebbe più bassa del 30%
  della zona libera, la camera si avvicina solo quanto basta e segue il personaggio in orizzontale
  (`follow`). Usata da cucina e case dei clienti.
- `layout.panelDock`: lato che i riquadri informativi tolgono alla scena (`top` in verticale e sui
  tablet, `left` sui telefoni in orizzontale). Da usare negli elenchi passati a `freeRect`.
- Sul `<body>` mette le classi `is-portrait` / `is-landscape`, `dev-small` / `dev-phone` /
  `dev-tablet`, `is-short` (altezza < 480 px). Su `:root` mette `--u` (la scala).

## Regole

1. **Niente `window.addEventListener('resize')`** nelle schermate: si usa `layout.on`.
   Niente `window.innerWidth/innerHeight` sparsi: si usa `layout.info`.
2. **Niente misure fisse in pixel per comandi e testi principali**: si usano le variabili
   in scala (`--btn`, `--act`, `--ride`, `--mm`, oppure `calc(… * var(--u))`).
   **Target toccabile minimo 44 px** (`max(44px, …)`).
3. **Ancoraggi**: gli elementi stanno attaccati a un bordo o a un angolo, con la safe area:
   `top: var(--sat)`, `right: var(--sar)`, `bottom: var(--sab)`, `left: var(--sal)`.
   Le safe area cambiano lato quando si ruota: le variabili lo fanno da sole.
4. **Disposizione dello schermo**:
   - colonna dei pulsanti **sempre a destra** (`.hud-right`), in verticale e in orizzontale;
     in orizzontale può diventare di 2 colonne. Se non ci stanno, i pulsanti in più vanno
     **da soli nel menu ☰** (`UI.layoutHud`). La larghezza della colonna è `--hud-w`.
   - riquadri informativi **in alto a sinistra** (`.jobbar`, `.guide`, `.hand-badge`,
     fumetto del tutorial), larghi al massimo fino alla colonna e alla minimappa
     (`100vw - … - max(var(--hud-w), var(--mm))`).
     In orizzontale diventano un **pannello laterale a sinistra** (`min(360px, 40vw)`).
   - niente pulsante azione fisso: l'anello da toccare (`.action`, `--ring`) segue l'oggetto sullo
     schermo (`UI.placeAction`), sempre dentro la safe area; Sali/Scendi in basso a destra.
   - anteprima delle migliorie (`.preview-bar`) in alto a sinistra, sopra il riquadro "in mano".
   - la **scena 3D** va nella zona libera: per le stanze `layout.freeRect` + `frameRoom` (camera ferma sulla stanza intera, oppure
     che segue il personaggio se la stanza è troppo larga);
     la città resta centrata sul personaggio (in orizzontale si vede più città, mai deformata).
5. **Finestre (`.sheet`)**: centrate, dimensione massima relativa allo schermo, scorrimento
   interno. Su schermi bassi (`is-short`) l'intestazione è compatta e **l'ultima riga di
   pulsanti resta sempre visibile** (sticky in fondo). Le azioni principali di una finestra
   vanno quindi nell'ultima `.btnrow` del contenuto.
6. **Elementi che seguono un oggetto** (fumetti, manine, freccette): si riposizionano a ogni
   fotogramma o a ogni `layout.on`, leggendo le posizioni attuali (mai salvate al momento
   dell'apertura).
7. **La rotazione non resetta niente**: niente chiusura di pannelli, niente reset di stato,
   niente interruzione di timer o guadagni. Le schermate ridisegnano solo la disposizione.
8. **Prima di finire una schermata nuova** si prova con `debug.html` (sotto).

## Modalità prova

`/debug.html` (in locale `http://localhost:5173/debug.html`, online
`…/hustle-idle/debug.html`): il gioco in una cornice da 360×640, 390×844, 430×932 o
768×1024, con **🔄 Ruota** (la partita continua, come un telefono vero) e notch/barra Home
simulati che cambiano lato (`?safe=top,right,bottom,left`, letto dal LayoutManager).

Misure da provare sempre, in verticale e in orizzontale: 360×640, 390×844, 430×932, 768×1024.
