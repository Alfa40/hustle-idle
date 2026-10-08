# HUSTLE IDLE — Game Design Document

> Versione 0.1 — 28/09/2026
> Documento di riferimento del progetto. Ogni decisione di design viene registrata qui.
> I numeri (prezzi, tempi, percentuali) marcati con *(tarabile)* sono valori iniziali da bilanciare con i test.

---

## 1. Visione

Gioco idle/gestionale in terza persona con visuale isometrica. Il giocatore parte senza soldi, fa lavoretti in giro per la città, mette da parte il capitale e apre le sue attività. Le fa crescere, assume dipendenti per automatizzarle e costruisce un impero. Lo scopo è **fare sempre più soldi**.

- **Stile:** personaggi e città low-poly in stile Kenney. Tono a metà strada tra il cartoon leggero e il gestionale.
- **Libertà totale (open world):** nessun blocco di livello o di esperienza. Per comprare qualunque cosa servono solo i soldi. La difficoltà sta nello **scegliere bene**, guardando domanda, costi, posizione e calendario.
- **Partita unica:** niente prestigio o rinascita, niente storia. Il motore del gioco sono le missioni giornaliere e settimanali.

## 2. Piattaforma e tecnologia

| Voce | Decisione |
|---|---|
| Target | **Telefono**, giocabile sia in **verticale** sia in **orizzontale** (l'interfaccia si adatta). Giocabile anche da PC |
| Aree sicure | L'interfaccia rispetta sempre le aree del notch/fotocamera frontale, dell'orario e della batteria (`safe-area-inset`), in entrambi gli orientamenti |
| Tecnologia | Web: **Three.js + Vite + TypeScript** |
| Peso | Leggero: download iniziale < ~10 MB, 60 fps su telefono di fascia media, pixel ratio limitato, modelli low-poly con instancing, ombre semplici |
| Grafica | Pack **Kenney CC0** (personaggi, city kit, food kit, furniture…) + **Blender** per i modelli mancanti |
| Salvataggio | Locale sul dispositivo (localStorage/IndexedDB) con salvataggio automatico |
| Lingua | Italiano (testi centralizzati in un file, così in futuro si possono tradurre) |
| Scopo | Progetto personale. Se il gioco viene bene, si completa per la pubblicazione |

## 2b. Verticale e orizzontale (LayoutManager)

Il gioco si usa in verticale e in orizzontale, su telefono e tablet. Le regole complete sono in **LAYOUT.md** e valgono per ogni schermata nuova.
- Un solo gestore (`src/ui/layout.ts`) conosce misure, orientamento, notch e barra Home (che cambiano lato ruotando) e avvisa tutte le schermate, con debounce
- Interfaccia in scala con il lato corto dello schermo (pulsanti mai sotto 44 px): più grande sui tablet, compatta sui telefoni piccoli
- Pulsanti sempre in colonna a destra (in orizzontale fino a 2 colonne); quelli che non ci stanno vanno da soli nel menu ☰
- Riquadri in alto a sinistra in verticale, pannello laterale a sinistra in orizzontale; cucina e case dei clienti si inquadrano nello spazio libero, mai deformate
- Finestre centrate con scorrimento interno; su schermi bassi intestazione compatta e pulsanti finali sempre visibili
- Ruotare non chiude niente e non interrompe azioni, tutorial, veicolo, timer o guadagni
- Pagina di prova `debug.html`: cornici 360×640, 390×844, 430×932, 768×1024, pulsante Ruota, notch simulato

## 3. Controlli e telecamera

- **Visuale isometrica dall'alto** che segue il personaggio.
- **Movimento solo col joystick virtuale** (compare dove si appoggia il dito). Toccare un punto dello schermo non fa muovere il personaggio. Su PC: WASD o frecce.
- Si interagisce avvicinandosi: NPC, porte degli edifici posseduti, postazioni dei mini-giochi.

## 4. Mappa

- **Città più estesa**: pianta di 13×13 isolati (prima 9×9, area più che doppia): attorno alla città originale (rimasta identica, con lotti e luoghi al loro posto) un anello di 2 isolati di nuovi quartieri con case, palazzi, negozi, ristoranti e parchi. Più traffico (44 auto, 26 pedoni). Peso sul telefono quasi invariato: gli edifici sono disegnati a gruppi per zona e si disegnano solo quelli inquadrati (≈300 chiamate di disegno come prima). Le 10 case dell'agenzia immobiliare restano quelle della città originale, così le case già comprate non cambiano

- **Scala del mondo** (`WS` in src/config/map.ts, ora 1,35): case, negozi, strade, alberi, lampioni e distanze sono più grandi del 35% rispetto al personaggio, ai veicoli e agli oggetti dei lavoretti (che restano della loro misura): più spazio attorno a tutto. Le posizioni nei lavoretti si scrivono in "metri di tessera" e `frame()` le moltiplica per `WS`; la posizione salvata del giocatore si converte da sola se cambia la scala

- **Una sola città** all'inizio, divisa in **zone** (per esempio periferia, residenziale, centro, zona commerciale).
- **La posizione conta:** ogni lotto ha un moltiplicatore di **passaggio/domanda** e un **costo** (affitto o acquisto). In centro ci sono più clienti ma costa di più.
- Le attività si aprono in **lotti disponibili**, distribuiti nelle varie zone.
- Il player **entra nei propri edifici dalla porta d'ingresso**. Dentro c'è la scena interna dell'attività (cucina, cassa, magazzino…).
- **Traffico senza ingorghi infiniti**: un'auto ferma dietro altre auto da più di 2,5 s, se non è inquadrata dalla camera (o appena esce dalla visuale), riparte da un tratto di strada libero e fuori vista, lontano dal giocatore. Gli ingorghi davanti al giocatore restano finché si vedono; le auto ferme per il giocatore non spariscono

## 5. Loop di gioco

```
Lavoretti (NPC "!") ──► soldi + esperienza + fama
        │
        ▼
Apri un'attività ──► lavori tu (mini-giochi) ──► guadagni, esperienza
        │
        ▼
Migliorie + dipendenti ──► più domanda, più efficienza, automazione
        │
        ▼
Manager + reparti completi ──► attività autonoma ──► passi a un'altra
        │
        ▼
Espandi all'infinito  OPPURE  vendi (offerte d'acquisto) e reinvesti
```

## 6. Lavori (fase iniziale)

- Si trovano **girando per la città**: NPC con il **punto esclamativo "!"**.
- Ogni lavoro è un **mini-gioco** semplice, per esempio: tagliare siepi o prato (tieni premuto sulle zone), consegne da A a B, lavapiatti o cameriere part-time.
- **Timer + valutazione a stelle (1–3):** più sei bravo e veloce, più guadagni.
- **Si può fallire** (tempo scaduto, cliente insoddisfatto): nessuna paga o paga ridotta e una piccola **penalità di fama** nella categoria.
- **Difficoltà crescente:** più il lavoro o l'attività è complessa, più i mini-giochi diventano difficili.

## 7. Attività

### 7.1 Tipi iniziali
- Food truck (di vario tipo: panini, hot dog, gelati, tacos…)
- Panificio/pasticceria
- Impresa di pulizie
- Ditta traslochi
- Negozio di ceramiche (ex laboratorio di artigianato)

Altre attività verranno aggiunte in futuro.

### 7.2 Gestione
- **Cosa vendere lo sceglie il player:** ogni attività ha un catalogo di prodotti (per esempio il food truck: panini, hot dog, tacos, gelati…). Il player decide quali mettere in vendita guardando la domanda del periodo, e può cambiarli.
- **Lavoro di persona:** mini-giochi **stile Overcooked semplificato** (prendi l'ordine, prepara, servi, incassa).
- **Costi fissi:** affitto (o mutuo), bollette, stipendi. Si può andare **in perdita**.
- **Magazzino:** le materie prime vanno comprate e stoccate. Se finiscono, non si vende.
- **Migliorie:** attrezzatura (più velocità), arredamento ed estetica (più domanda), capienza (più clienti contemporanei), nuovi prodotti, marketing (più domanda), magazzino più grande.
- **Crescita libera:** si può espandere un'attività all'infinito oppure passare gradualmente ad altre.
- **Offerte d'acquisto casuali:** se un'attività è molto redditizia, arrivano offerte per comprarla. Il player sceglie se vendere (grossa somma da reinvestire) o tenerla e farla crescere. Il valore dipende dagli utili, dalle migliorie, dalla posizione e dalla fama.

### 7.3 Dipendenti
- Hanno **statistiche e livelli** (per esempio velocità, abilità, cortesia). I più bravi costano di più.
- **Si vedono sulla mappa e negli interni** mentre lavorano.
- **Pagati mensilmente** (mese di gioco).
- Ogni attività è divisa in **reparti** (per esempio food truck: cucina + cassa; panificio: laboratorio + banco + magazzino).
  - **Un dipendente per reparto:** il reparto lavora da solo.
  - **Più dipendenti in un reparto:** il reparto è più efficiente.
  - **Il player può aiutare** in qualsiasi reparto per guadagnare di più.
  - **Autonomia completa** (il player può lasciare l'attività): serve **almeno un dipendente per ogni reparto + un manager**.
  - Senza manager, l'attività funziona solo quando il player è presente.

## 8. Domanda e mercato

La domanda stabilisce **quanti clienti arrivano**. Formula di partenza *(tarabile)*:

```
clienti/ora = base_prodotto
            × moltiplicatore_zona
            × (1 + bonus_fama_categoria)
            × moltiplicatore_migliorie
            × moltiplicatore_evento_calendario
            × fattore_casuale (0.8 – 1.2)
```

- **Casuale ma guidata:** ogni prodotto ha una domanda che oscilla da un giorno all'altro.
- **Calendario di gioco** (si apre toccando la data in alto):
  - **Eventi sicuri:** feste fisse a date precise (Concertone del 1° Maggio, Festa della Repubblica, Notte bianca, Ferragosto, Halloween, Mercatini di Natale, Capodanno…), appuntamenti settimanali (mercato del sabato, domenica al parco) ed eventi casuali annunciati 2–5 giorni prima (festa del quartiere, fiera dello street food, concerto, sagra).
  - **Meteo con previsioni a 7 giorni** in percentuale: sole, nuvoloso, pioggia, temporale, ondata di caldo, gelata, neve, con probabilità diverse per stagione. Più il giorno è lontano, meno la previsione è affidabile. Il tempo tende a durare più giorni.
  - Ogni evento e ogni tempo mostra il suo effetto sulla domanda (es. "🍦 ×2").
- **Concorrenti:** per ora no.

## 9. Esperienza e fama

### 9.1 Categorie iniziali
| Esperienza | Da dove arriva |
|---|---|
| Cucina | food truck, panificio, lavapiatti o aiuto cuoco |
| Manualità/Edilizia | giardinaggio, traslochi, lavoretti di riparazione |
| Artigianato | negozio di ceramiche (anche gli ordini speciali), lavoretti artigianali |
| Clientela | cassa, servizio, vendita |
| Logistica | consegne, traslochi |
| Gestione/Business | gestione delle attività, contratti, vendite di attività |

Nuove categorie arriveranno insieme alle nuove attività.

### 9.2 Regole
- **L'esperienza** del personaggio sale **solo facendo il lavoro di persona**.
- **La fama** di una categoria sale lavorando e anche quando le attività lavorano senza il player, ma **molto più lentamente**.
- La fama alta **aumenta la domanda** delle attività di quella categoria e sblocca **offerte di lavoro più redditizie**.
- Anche la fama complessiva influisce sul valore di rivendita di case e attività.

### 9.3 Bacheca missioni
- **Missioni giornaliere** (5, lavori brevi) e **settimanali** (2, più lunghe e con premi più alti; in futuro anche lavori strutturati, per esempio catering per un matrimonio o il trasloco di un'azienda).
- Il tipo di missione, la ricompensa e la difficoltà cambiano in base a **fama ed esperienza** del player e si rinnovano ogni giorno o ogni settimana.

### Classifica mondiale
- Dal Profilo → **🏆 Classifica mondiale**: primi 50 giocatori per fama totale (somma della fama di tutte le categorie), con nome e rango; la propria riga è evidenziata e compare anche se si è fuori dai primi 50.
- Al primo accesso si sceglie il nome (max 20 caratteri, modificabile). Identità anonima per dispositivo: un solo posto per dispositivo, vale la partita con più fama.
- Il punteggio si invia in automatico col salvataggio (al massimo una volta al minuto) e all'apertura della classifica; senza rete il gioco continua normalmente.
- Backend: lo stesso servizio Render + Upstash Redis della classifica di Magic Trip (`crazy-town.onrender.com`), con chiavi separate (`hustle:leaderboard`, `hustle:player:<id>` con logo e attività, `hustle:code:<codice>`; `?game=hustle`, `/leaderboard/friends`).

### Logo, amici e città condivisa
- **Nome e logo obbligatori**: entrando in una partita, se non sono ancora stati scelti il nome (per dispositivo) e il logo (per partita), il gioco apre subito "👋 Scegli nome e logo" (dopo l'eventuale consiglio per la schermata Home, prima del benvenuto). Non si chiude finché non si salva con un nome; si ripropone a ogni avvio finché non è fatto, sia dal browser sia dall'icona sulla Home
- **Logo** (uno per partita, `state.logo`, src/logo.ts): dal Profilo → 🎨 Il tuo logo. La schermata ha una barra in alto con due schede: **🎨 Crea logo** (forma, colori, simbolo, iniziali, "A caso") e **📷 Foto** (scegli una foto, ritoccala, cambiala o toglila). Anteprima e nome sono sempre visibili: sopra in verticale, in una colonna a sinistra in orizzontale; in fondo sempre "Salva il logo" (o "Usa questa foto" mentre si ritocca). Si sceglie forma (cerchio, scudo, quadrato, stella, esagono), colore di sfondo, simbolo (30 emoji), iniziali (max 3) e il loro colore, più il nome del giocatore. Compare sopra le insegne delle proprie attività, nel profilo, in classifica e sulla mappa degli amici
- **Foto come logo**: si carica una foto dal telefono e la si ritocca (trascinare per spostarla, zoom, rotazione, luminosità, contrasto, colori, bianco e nero) dentro la forma scelta; salvata come JPEG 160×160. La foto la vedono solo gli amici: nella classifica mondiale (pubblica) compare il logo disegnato
- **Amici**: ogni dispositivo ha un codice amico di 6 caratteri (ricavato dall'id anonimo). Nella classifica, scheda 👥 Amici: il proprio codice (copia / invia con la condivisione del telefono), aggiunta di un amico col suo codice, classifica tra amici con i loghi, amici da togliere. L'amicizia è da una parte sola (vedi chi aggiungi)
- **Attività degli amici sulla tua mappa**: ogni 5 minuti si scaricano le attività degli amici; quelle su lotti liberi nella tua città compaiono con furgone/insegna, il nome e il logo dell'amico (🤝 nella mappa). Toccandole: scheda con l'amico e il posto (che resta acquistabile: se lo compri, la tua attività prende il posto di quella dell'amico). Se più amici hanno lo stesso lotto, si vede quello con più fama
- **Stesso posto, più attività**: se tu e i tuoi amici avete un'attività nello stesso posto, sui posteggi i furgoni stanno affiancati e ben separati (il tuo al centro, poi fino a 2 amici con più fama); sugli edifici ogni amico ha un piano in più sopra il tuo locale (fino a 3), più in alto chi ha più fama. Il furgone di un amico è aperto (tendone) e il suo piano ha le luci accese solo se sta giocando in quel momento (segnale "sto giocando" ogni minuto, valido 3 minuti); altrimenti serranda abbassata e finestre spente
- **Logo come marchio**: stampato grande sul tetto e sul fianco di ogni furgone (tuo e degli amici), sulla facciata dei locali sopra l'ingresso e sospeso sopra l'insegna
- **In futuro — città condivisa**: un server in tempo reale (WebSocket, come il co-op di Crazy Town) dove più amici giocano nella stessa città: ognuno con i propri lavoretti, attività e loghi; si vedono i personaggi degli altri muoversi, si può entrare nelle attività degli amici per guardarle lavorare e girare la città insieme. Servirà: stanze per gruppi di amici, lotti assegnati una volta sola per città, sincronizzazione di posizioni/animazioni e dello stato delle attività (il tempo di gioco condiviso), e regole per chi è offline (le sue attività continuano come ora in idle)

### Negozio (pulsante 🛍️ sotto Casa)
- **Concessionaria**: si comprano i veicoli da qui, senza andare in centro
- **Agenzia immobiliare**: 10 case in vendita (prezzo per zona: periferia ~9.000 €, residenziale ~15.000 €, centro ~26.000 €). Una casa comprata si può: 🏠 viverci (il pulsante Casa ti porta lì e lì dormi; la casa di partenza resta), 🔑 affittare (solo con almeno 2 case, contando quella di partenza, e non quella dove vivi): l'affitto si guadagna **solo mentre il gioco è chiuso**, 0,15% del prezzo per ogni ora reale, fino a 48 ore, e compare nel riepilogo "Bentornato", vendere all'85%. Il 📍 mette il segnaposto sulla mappa
- **Stile e accessori**: 9 stili (i personaggi Kenney, il primo gratis) e accessori agganciati alla testa (seguono le animazioni), uno per parte del corpo: testa (cappellino, cilindro, corona), occhi (occhiali da sole, a cuore), collo (collana d'oro, di perle, sciarpa), schiena (zaino, mantello). Si comprano una volta per partita e si indossano/tolgono quando si vuole

### Installazione sulla schermata Home
- Ogni volta che il gioco si apre dal browser (non dall'icona sulla Home) compare un consiglio: perché conviene (schermo intero, si apre con un tocco, salvataggi più al sicuro, più fluido) e i passaggi giusti per il telefono in uso (iPhone: 3 puntini → Condividi → Aggiungi alla schermata Home, con Safari o altri browser; Android con Chrome, computer). Su Android con Chrome c'è anche il pulsante "Installa adesso". Si chiude con "Più tardi"
- Manifest con icone 192/512 (anche maskable) e apple-touch-icon, così l'icona sulla Home è quella del gioco

### Risparmio batteria (Opzioni)
- Il gioco non supera mai 60 immagini al secondo, anche sugli schermi a 120 Hz (meno calore, niente crash)
- 🔋 Risparmio batteria (spento di serie): 30 immagini al secondo invece di 60, 15 dopo 5 s senza toccare lo schermo, risoluzione massima 1,1× (ombre e contorni restano). Il tempo di gioco scorre normalmente. Senza risparmio: città ~150–300 oggetti e ~160–320 mila triangoli per immagine, dentro le attività ~60–120 oggetti

### Pulsanti a destra (Opzioni → Pulsanti a destra)
- Ordine modificabile con ▲▼ per Attività, Missioni, Profilo, Casa, Negozio, Opzioni, Camera. Ognuno può essere "Visibile" o "Nel menu": quelli nel menu spariscono dalla colonna e si aprono col pulsante ☰ Menu (in fondo alla colonna, compare solo se c'è almeno un pulsante nel menu; il "!" delle missioni passa sul ☰). Tutti, alcuni o nessuno. "Disposizione iniziale" ripristina tutto
- Il pulsante Sali/Scendi del veicolo in verticale sta a sinistra della colonna (non copre più Camera); si può usare anche mentre si tiene il dito sul joystick (risponde al tocco, non al "click"): si sale o si scende senza fermarsi e il joystick continua a funzionare. I messaggi a comparsa stanno più in alto, così non coprono Sali/Scendi

### Orari delle attività
- I locali e i furgoni si possono usare solo da aperti (8:00–22:00): fuori orario la porta è chiusa ("🔒 Chiuso · apre alle 8:00") e il gioco suggerisce di andare a dormire; a chiusura, servito l'ultimo cliente, si esce da soli. I tuoi furgoni abbassano la serranda di notte. L'ufficio delle imprese di servizi resta sempre raggiungibile

### Dipendenti mentre lavori tu
- Se stai lavorando (hai qualcosa in mano o hai usato una postazione negli ultimi 8 s) i cuochi iniziano prodotti nuovi solo quando gli ordini da preparare sono più di quanti ne porti tu, e prendono quelli in fondo alla coda; i tuoi prodotti sul fuoco li tolgono solo quando stanno per bruciare. Se sei fermo lavorano da soli come prima

## 10. Tempo di gioco

- **1 mese di gioco = 2 ore reali** (4 minuti reali per giorno di gioco) *(tarabile)*.
- Gli stipendi e i costi fissi si pagano a fine mese di gioco.

### 10.1 Guadagno offline
- **Offline il tempo di gioco scorre 100 volte più lentamente** (1 mese di gioco = 100 ore reali) *(tarabile, valore di prova)*.
- Il guadagno offline è quanto le attività autonome produrrebbero nel tempo di gioco trascorso (già rallentato), moltiplicato per l'efficienza della fascia. Anche stipendi e costi fissi scorrono con lo stesso rallentamento.
- L'efficienza del guadagno offline cala con il tempo reale passato fuori dal gioco:

| Tempo reale offline | Efficienza |
|---|---|
| Prime 24 h | 80% |
| Dalle 24 h alle 72 h (le 48 h successive) | 50% |
| Oltre le 72 h | 20% |

- Solo le attività **autonome** (reparti coperti + manager) producono offline.
- Al rientro compare un **riepilogo**: incassi, costi pagati, eventi accaduti.

## 11. Personaggio

- **Personalizzazione** dell'aspetto del personaggio: sì.
- **Nessun bisogno** (fame, sonno, energia) per ora.
- **Mezzi di trasporto** migliorabili: a piedi → bici → scooter → auto (le auto sono più veloci per attraversare la città).
- **Case:**
  - Si possono possedere **più case**.
  - Ogni casa è un **punto di teletrasporto istantaneo** per muoversi rapidamente in città.
  - Si possono **vendere**. Il prezzo di vendita dipende da **arredamento, posizione e fama del player** (quando è alta).

## 12. Prima versione giocabile (MVP)

Obiettivo: provare il loop base su telefono.

- 1 quartiere della città (2 zone con moltiplicatori diversi)
- Movimento: joystick + tocco, camera isometrica
- 3 lavoretti con NPC "!": **giardinaggio**, **consegne**, **lavapiatti** (timer, stelle, possibilità di fallire)
- 1 attività: **food truck** con catalogo prodotti a scelta del player (panini, hot dog, tacos, gelati) e reparti Cucina + Cassa, mini-gioco semplificato, magazzino, costi fissi
- Assunzione di dipendenti (statistiche base) + manager → autonomia
- 4 esperienze: Cucina, Manualità, Clientela, Logistica, con relativa fama
- Bacheca con missioni giornaliere
- Calendario con 2–3 eventi di prova
- 1 casa iniziale (punto di teletrasporto)
- Salvataggio automatico + guadagno offline
- HUD: soldi, data di gioco, notifiche

Dopo l'MVP: altre attività, veicoli, più case, offerte d'acquisto, missioni settimanali, altre zone.

## 13. Punti aperti

- **Guadagno offline al 100× più lento (valore di prova):** 30 ore offline con un food truck autonomo in periferia ≈ 9 giorni di gioco ≈ €430 netti. Un'ora di gioco attivo con lo stesso furgone ≈ €2.600. Da ritarare dopo i primi test.

## 14. Stato dello sviluppo

### Prototipo 0.1 (28/09/2026), fatto
- Città a tessere con 3 zone (centro, residenziale, periferia), strade automatiche, case e negozi Kenney
- Movimento con joystick dinamico + tocco per muoversi (e tastiera su PC), camera isometrica
- Interfaccia adattiva verticale/orizzontale con margini per notch, orario e batteria
- 3 lavori con NPC "!": giardinaggio (tieni premuto), consegne (con freccia guida), lavapiatti (strofina)
- Timer, stelle, fallimento con penalità di fama, difficoltà e paga che crescono con livello e fama
- 3 lotti per food truck con prezzo, affitto e domanda diversi per zona
- Food truck: scelta dei prodotti in base alla domanda, magazzino, migliorie, interno stile Overcooked (frigo → piastra → finestra)
- Dipendenti con statistiche e livelli, reparti cucina e cassa, manager per l'autonomia e il riordino automatico
- Costi fissi mensili (posteggio, bollette, stipendi pagati in proporzione ai giorni)
- 4 esperienze con fama e bonus di domanda, rango del giocatore
- Calendario con stagioni ed eventi annunciati in anticipo, domanda giornaliera casuale
- Bacheca con 3 missioni giornaliere
- Casa: teletrasporto e "dormi fino alle 7"
- Salvataggio automatico e guadagno offline a fasce

### Versione 0.2 (28/09/2026), fatto
- Freccette ai bordi dello schermo verso i 3 lavoretti più vicini (o verso l'obiettivo del lavoro in corso), con distanza
- Minimappa centrata sul giocatore + mappa a tutto schermo con legenda, lavori vicini (direzione, distanza, paga) e food truck
- Interfaccia allegra: font Fredoka, pannelli chiari con intestazione colorata, pulsanti con etichetta, schede con icone
- Calendario con eventi sicuri e previsioni meteo

### Versione 0.3 (28/09/2026), fatto
- Tempo più lento: 1 mese di gioco = 2 ore reali
- 10 lotti in vendita: 5 posteggi per food truck e 5 locali per negozi e imprese
- Nuove attività: **Panificio** e **Laboratorio artigiano** (bancone come il food truck), **Impresa di pulizie** e **Ditta traslochi** (attività di servizio: arrivano ordini che il titolare esegue a domicilio, oppure li fanno i dipendenti)
- **Agenzia affari:** le tue attività, lotti in vendita con stime di incasso e utile, resoconti e confronti, mercato per zona
- **Concessionaria:** monopattino, scooter, utilitaria, berlina, SUV, sportiva (velocità diverse, assicurazione mensile per le auto), pulsante per salire e scendere
- Nuovi lavoretti: volantinaggio, lavaggio auto, imbianchino. Nuova esperienza **Artigianato**
- Corretto lo scorrimento della mappa che tornava in cima

### Versione 0.4 (28/09/2026), fatto
- Città 5 volte più grande (37×37 tessere, 9×9 isolati): centro commerciale in mezzo, anello residenziale, periferia con parchi. 17 lotti in vendita (7 posteggi, 10 locali)
- La città è divisa in riquadri di disegno: sul telefono si disegna solo la parte vicina alla camera
- Mappa interattiva a tutto schermo: trascina, zoom con due dita/rotellina/pulsanti, centra su di me, tutta la città
- Filtri attivabili (lavoretti, le mie attività, in vendita, luoghi) e barra di ricerca su nomi, tipi di attività, prodotti e vie
- Scheda del posto toccato con distanza e direzione, "Dettagli" e "📍 Segna percorso": il segnaposto ha la sua freccetta e sparisce quando arrivi

### Versione 0.5 (28/09/2026), fatto
- Schermata iniziale con la città 3D che gira sullo sfondo: Continua, Nuova partita, Carica partita, Impostazioni, Crediti
- 3 slot di salvataggio con nome della partita, rango, soldi, attività, data di gioco e "giocata X fa"; eliminazione con conferma. Il vecchio salvataggio finisce nello slot 1
- Impostazioni (anche in partita, pulsante Opzioni): qualità grafica, ombre, distanza camera, freccette, minimappa
- In partita: "Salva e torna al menu principale" e "Ricomincia questa partita"

### Versione 0.6 (tappa 1), fatto
- Barra del lavoretto in alto, al posto di data ed eventi
- Corretto: le freccette ai bordi puntavano nella direzione opposta per i posti molto lontani (dietro la camera)
- Attività al bancone in 3D con lavorazione a più fasi (config/recipes.ts): ogni prodotto passa da più postazioni (prendi, lavora tenendo premuto, cottura a tempo con rischio di bruciare, consegna)
- Ordini con più prodotti e ordini da asporto (fase di imballaggio); ripiano dei pronti dove i dipendenti appoggiano i prodotti
- Miglioria "Ampliamento del locale" (2 livelli): stanza più grande, nuove postazioni, nuovi prodotti (es. tacos e gelati nel food truck, pizza e torte nel panificio, sedie e gioielli nel laboratorio)

### Versione 0.7 (tappa 2), fatto
- Pulizie e traslochi in 3D dentro la casa del cliente (world/clienthouse.ts): si raggiunge l'indirizzo, si entra in casa (1–3 stanze arredate) e il lavoro si fa lì
- Pulizie: carrello con 3 attrezzi (spugna per le macchie a terra, piumino per polvere e ragnatele sui mobili, tergivetro per i vetri appannati); ogni sporco si pulisce solo con l'attrezzo giusto
- Traslochi: scatoloni da caricare, oggetti sparsi da imballare al banco prima di caricarli, mobili pesanti da sollevare tenendo premuto (si cammina più piano); tutto va portato al furgone all'ingresso
- Tempo, stelle e progressi nella barra in alto; la paga dipende dalle stelle

### Versione 0.8 (tappa 3), fatto
- Lavoretti a fasi (PhasedRun): zona di lavoro rettangolare con coni e cartello, avviso se ne esci, fasi numerate nella barra in alto, icone sopra i punti da fare
- Giardinaggio: tosasiepi → taglia i cespugli → raccogli le foglie → svuota nel bidone
- Consegne/volantini: carica in negozio → consegna agli indirizzi in qualsiasi ordine → ricevuta
- Lavapiatti (dehors del ristorante): per ogni tavolo prendi → lava al lavello → scolapiatti
- Lavaggio auto: secchio → insapona 4 lati → canna → risciacqua 4 lati
- Imbianchino (muretto): copri le piante → vernice → dipingi ogni tratto → togli i teli
- Durante un lavoro spariscono palazzi e alberi che coprono la zona; il cliente si fa da parte

### Visuale
- Terza persona in giro per la città, nelle attività e nelle case dei clienti
- Lavoretti di nuovo in terza persona (la prima persona rendeva i lavori più difficili da telefono; il codice resta, `Game.FP_JOBS`, per riprovarla più avanti in modo meno confusionario). Prima: Prima persona automatica solo durante i lavoretti: occhi sopra e un po' dietro la testa (non entrano nei muri), campo visivo ampio, oggetti in mano nascosti (indicati nella barra), sguardo che si gira da solo verso il prossimo punto quando non si trascina il dito, leggero ondeggiare camminando, passaggio morbido tra le visuali

### Grafica 0.9
- Cielo a gradiente con sole che segue l'ora (alba, giorno, tramonto dorato, notte) e nuvole low-poly in movimento
- Paesaggio attorno alla città: prato con sfumature, fascia di boschi, colline e lago
- Tone mapping neutro (colori vivi e naturali), ombre morbide più definite con qualità Alta/Media
- Contorni cartoon su tutti gli oggetti (passaggio di profondità a tutto schermo), attivabili nelle impostazioni

### Vita in città
- Traffico: auto che tengono la destra, girano agli incroci, si fermano davanti al giocatore e alle altre auto (fari accesi di notte); pedoni che passeggiano attorno agli isolati
- Notte: finestre che si illuminano, lampioni con alone e cerchio di luce a terra
- Particelle: foglie (giardino), bolle (lavaggi, lavapiatti, pulizie), schizzi di vernice, fumo da piastra/forno (scuro se brucia), polvere, scintille a lavoro completato

### Chiarezza (0.9.1)
- Comandi camera (🎥 nella colonna a destra): ruota, zoom, inclina, visuale standard; pareti tra camera e stanza nascoste
- Dentro le attività non c'è più il riquadro con soldi, coda e capienze (toglieva spazio alla cucina): resta solo il riquadro "in mano" in alto; le capienze e i conteggi stanno sulle etichette delle postazioni. L'inquadratura comprende cucina, bancone e fila dei clienti (la sala del locale grande resta fuori, così la cucina è più grande); se la cucina è troppo larga (locale grande in verticale) la camera segue il personaggio
- Fasi a colori: 🔵 Prendi (frigo/dispensa), 🟠 Cuoci (piastra/forno/fornace), 🟣 Prepara (banchi), 🟢 Servi (bancone e ripiano). Tappetino davanti a ogni postazione, etichetta, anello e freccia della prossima postazione hanno il colore della fase
- Riquadro "in mano" (giallo) subito sotto la guida: una riga per ogni posto in mano (tanti quanti se ne possono portare; i posti liberi sono righe tratteggiate vuote). Ogni prodotto dice com'è e cosa gli manca: "Panino · da cucinare", "Panino cucinato · da assemblare", "Hot dog assemblato · pronto per i clienti", "freddo · da buttare" (colore della fase). In verticale l'inquadratura dell'attività è abbassata del 7% dello schermo per fargli spazio
- Più prodotti in mano con l'esperienza nel campo dell'attività: 1 all'inizio, 2 dal Liv. 3, 3 dal Liv. 6, 4 dal Liv. 10. Si portano su un vassoio alto sulla spalla: i prodotti ancora da lavorare sono cubetti del colore della prossima fase, quelli pronti sono il prodotto vero, i freddi azzurri; sopra la testa "✋3/3 🥪×3→🔥". Piastra e forno ricevono tutti i prodotti in mano che ci vanno (finché c'è posto) e si ritira tutto il pronto; il banco si lavora un prodotto alla volta; al bancone si servono tutti quelli ordinati insieme
- Cottura più lunga: piastra 4,6 s, forno 5,8 s, fornace 7 s (×1,3)
- Scritte 3D più piccole: le postazioni mostrano solo l'icona (e i posti occupati), il nome completo solo sulla prossima

### Cucina stile Cooking Fever
- Si può preparare in anticipo senza ordini (alle postazioni di partenza, a rotazione tra i prodotti) e appoggiare i pronti sul ripiano (max 4)
- A mani vuote al bancone si serve direttamente dal ripiano
- Ogni prodotto pronto resta caldo 45 s (secondi visibili sopra la testa e nella guida), poi è ❄️ freddo: non si serve e va buttato
- Cotture e lavorazioni +30%; pazienza clienti ×2,2

### Cucina: miglioramenti visibili e dipendenti di supporto
- Nuovi miglioramenti (attività con interno): Fuochi e forni extra (fino a 3), Banco di lavoro extra (fino a 2), Ripiano pronti più grande (+2 posti per livello). Tutte le postazioni stanno lungo le pareti (fondo, poi parete destra a L) e gli extra accanto a quelle dello stesso tipo; il centro resta libero. Se la parete è piena il gioco avvisa: prima serve ampliare il furgone/locale
- Ogni miglioramento si vede: attrezzatura = postazioni dorate, look = piante e tappeto, pubblicità = manifesti, magazzino = scatoloni, più prodotti = lavagna del menù
- Cuochi: di base aiutano (tolgono dal fuoco ciò che il giocatore non prende, lo finiscono e lo mettono sul ripiano, buttano il freddo); con la coda lunga (3+ clienti) preparano anche da zero. Si possono assumere quanti dipendenti si vuole (8 candidati al giorno, pulsante per cercarne altri a €40)

### Catena di montaggio (attività con interno)
- Aree: 🍳 Cucina, 💰 Cassa, 📦 Magazzino (dal 1° ampliamento), 🍽️ Sala con tavoli (dal 2° ampliamento)
- Cuochi: ognuno prende un prodotto mancante e lo segue da zero (materia prima → fuoco → lo toglie lui → lavorazioni → ripiano); più cuochi si dividono il lavoro; i liberi fanno i jolly (salvano dal fuoco, buttano il freddo)
- Cassieri: prendono dal ripiano, portano al bancone, consegnano e incassano
- Camerieri (nuovo ruolo): portano il cibo ai clienti seduti in sala, mance più alte
- Magazzinieri (nuovo ruolo): portano le scorte dal magazzino al frigo e riordinano anche senza manager

### Lavoretti
- **Grafica dei lavoretti (ottobre)**: oggetti a grandezza vera, ben visibili prima di prenderli (cassetta degli attrezzi, bidone, barattoli di vernice, spruzzino, avvolgitubo, secchio con stracci). Gli indicatori stanno sopra l'oggetto più alto lì vicino (o di lato, per edicola e negozio) e non si sovrappongono
  - **Imbianchino** ("Dipingere la recinzione"): il muretto è la recinzione del giardino davanti alla casa (dietro non c'è spazio), con pilastri e cancello; in giardino cespugli, aiuole, scivolo, tavolino, vasi. Ogni cosa si copre con un telone su misura (telo morbido con pieghe che cala sull'oggetto), poi si dipinge ogni tratto e si tolgono i teloni
  - **Lavaggio auto**: spruzzino del sapone su tutti e 4 i lati (schiuma), canna dell'acqua facendo il giro dell'auto in ordine (gocce), straccio per asciugare ogni lato
  - **Consegne**: si ritira a un'attività vera sul marciapiede: 📰 edicola (chiosco verde con tettoia a strisce) per i giornali, 📦 negozio dei pacchi (banco del corriere con scaffale e insegna rossa). Cassette della posta su palo con busta disegnata, sportello e bandierina (blu per i giornali, gialle per i pacchi). Il volantinaggio è diventato "Consegna giornali"
  - **Lavapiatti**: si va al ristorante (chiuso) e si entra nella sua cucina (src/world/dishkitchen.ts): fornelli e frigo spenti, carrello con le pile di piatti sporchi, lavello, scolapiatti. Per ogni pila: prendi → lava → appoggia. I ristoranti dei lavoretti non sono mai le attività del giocatore
- **Tutorial contestuale**: la prima volta che fai un tipo di lavoretto (interruttore "🎓 Con il tutorial" nella scheda, acceso di serie finché non l'hai completato, poi lo puoi riaccendere) il tempo è fermo ("🎓 senza tempo") ed è solo una prova: nessuna ricompensa (né soldi, né esperienza, né fama, né missioni) e nessuna penalità se lo interrompi; a fine tutorial il lavoretto resta disponibile ("▶ Fallo adesso") per farlo sul serio e prendere le ricompense e un fumetto subito sotto il riquadro del lavoretto spiega la fase: dove andare (frecce fino alla zona, "torna dentro i coni"), cosa fare e perché (testi per ogni fase in src/ui/jobtutorial.ts), e il gesto. Vicino all'oggetto una manina grande sull'oggetto che lampeggia mostra "tocca" o "tieni premuto". Completato con almeno una stella (in tutorial o sul serio), quel tutorial resta spento per sempre in quella partita, a qualsiasi livello: serve solo per un tipo di lavoretto nuovo. La scheda del lavoretto non ha più la spiegazione scritta: solo paga, difficoltà, esperienza e l'interruttore del tutorial
- Spiegazione prima di accettare: nella scheda del lavoretto un "mini video" mostra la procedura passo passo (icona grande, cosa fare, gesto animato: 👆 tocca, ✊ tieni premuto con barra che si riempie, 🚶 vai), con l'elenco numerato dei passi sotto (config/jobs.ts `steps`)
- Prima di arrivare nella zona di lavoro la barra dice "🚶 Vai alla zona di lavoro: segui le frecce"; se poi si esce, l'avviso compare accanto alla fase senza nasconderla
- Gli oggetti da usare nella fase attuale hanno il loro colore più acceso e chiaro che pulsa (niente luce esterna); la scena è leggermente più scura per farli risaltare: cassetta attrezzi, cespugli, bidone, cassette postali, lavello, secchio, muretto…
- Volantinaggio e consegne: al negozio c'è un espositore giallo dei volantini o una pila di pacchi; a ogni indirizzo una cassetta della posta su palo con bandierina, così il punto si trova subito

### Tutorial della cucina e prova delle migliorie
- **Tutorial della cucina** (src/ui/biztutorial.ts): la prima volta che entri in un tipo di attività con interno (food truck, panificio, laboratorio) arriva un solo cliente e un fumetto sotto il riquadro "in mano" ti guida nel primo ordine, postazione per postazione: legenda dei colori (🔵 Prendi, 🟠 Cuoci, 🟣 Prepara, 🟢 Servi), dove andare, cosa fare e il gesto (manina su "tocca" o "tieni premuto"). Il tempo è fermo (il cliente non perde la pazienza, niente si raffredda né brucia, i dipendenti aspettano) ed è solo una prova: niente soldi, scorte, esperienza o fama. Poi due schede: ripiano dei pronti e calore (45 s, cestino), e dipendenti, manager e "👁️ Prova". Si può saltare. Visto una volta (`state.bizTutorials`), non si ripropone per le altre attività dello stesso tipo
- **👁️ Prova prima di comprare**: accanto a "Migliora" per Ampliamento, Fuochi extra, Banco extra, Ripiano più grande e Attrezzatura, e accanto ad "Assumi" per i candidati (non il manager). Si entra in una copia del locale con la modifica già fatta (l'ampliamento mette in vendita anche i prodotti che sblocca), scorte piene e un cliente ogni 7 secondi a qualsiasi ora, insieme ai dipendenti che hai già. Niente guadagni né spese, l'attività vera continua a lavorare. Riquadro viola in alto: cosa stai provando, ordini serviti, "✖ Esci" e "✅ Compra" (o "Assumi"; dice "Mancano €…" se non bastano i soldi). Uscendo torni dov'eri e si riapre la scheda dell'attività

### Tocca l'oggetto (niente pulsante azione)
- Non c'è più il pulsante giallo fisso: quando sei abbastanza vicino si tocca **l'oggetto che lampeggia** (la zona da toccare, invisibile, è un po' più grande dell'oggetto: 76–116 px). La **scritta dell'azione** sta in alto, subito sotto il riquadro (soldi, lavoretto o "in mano"; con il tutorial sotto il suo fumetto). Il **cerchio** semitrasparente, piccolo, poco sopra la testa del personaggio, compare solo per le azioni "tieni premuto" e si riempie di verde tenendo il dito sull'oggetto o sul cerchio (il pulsante del cerchio è più grande del disegno); con un tocco singolo il cerchio si riempie in un lampo per far vedere che l'azione è partita. Vale in città, nei lavoretti, nelle attività, nelle case dei clienti e nella cucina del lavapiatti. Su PC restano E e spazio
- Ogni azione dice dove sta l'oggetto (`ActionPrompt.at`); il pulsante Sali/Scendi del veicolo è passato in basso a destra
- Le manine dei tutorial sono più grandi, con il bordo bianco, e toccano il centro dell'anello

### Altro (ottobre)
- Lavapiatti: cucina più profonda, attorno al carrello dei piatti si passa sia dietro (verso il lavello) sia davanti
- Food truck: un solo logo, grande, sul tetto (niente logo sul fianco, logo sospeso o insegna sopra)
- Le attività autonome guadagnano anche mentre giochi (lavoretti, altre attività, anteprime); solo quella in cui sei dentro la gestisci tu
- **Missioni**: 5 al giorno e 2 della settimana (più lunghe, premi ~5 volte più alti: 15–20 lavoretti, 3 stelle in 6–9 lavori, un lavoretto di ogni tipo, 50–80 clienti, guadagna ~€1.200 nella settimana). I premi delle missioni non contano per "Guadagna €…"
- **Progressione**: fino al Liv. 5 servono il 40% di XP in meno (Liv. 2: 30, 3: 120, 4: 270, 5: 480), poi la salita è più graduale (6: 990, 7: 1.620, 8: 2.370, 10: 4.230). La difficoltà dei lavoretti cresce di un gradino a livello fino al 5, poi di 0,6 (`jobDifficulty` in config/balance.ts)

### Finestre e profilo (ottobre)
- **‹ Indietro**: ogni finestra aperta da un'altra finestra ha il tasto ‹ in alto a sinistra, che riporta alla precedente con la sua scheda (es. Attività → gestione di un'attività → ‹ → un'altra attività; Profilo → Statistiche → ‹). ✕ chiude tutto
- **Profilo**: logo, nome (✏️ per cambiarlo), rango, fama e livello totale; sotto, una barra con 5 pulsanti: 📊 Statistiche, 👥 Amici (con il numero di richieste), ⭐ Esperienza (fama ed esperienza per campo, come prima), 🏆 Classifiche, 🎨 Logo (come prima); poi soldi guadagnati, €/s, attività e lavoretti
- **📊 Statistiche** (`state.stats`): giorni e tempo di gioco, rango, fama, livello, missioni; soldi adesso, guadagnati in totale e oggi, miglior giornata, €/s delle attività autonome (utile stimato al mese ÷ 7.200 s, cioè un mese di gioco), utile al mese; lavoretti completati, con 3 stelle, falliti e per tipo; attività aperte, attive, autonome, fallite (per ora non possono fallire: resta 0), clienti serviti di persona, ordini a domicilio; scheda di ogni attività con incassi
- **👥 Amici**: in ordine di fama (tu evidenziato). Toccando un amico si apre l'anteprima del suo profilo (soldi, €/s, lavoretti, attività, clienti, livello, giorni di gioco) con "Togli dagli amici". "➕ Invita nuovi amici" apre la tendina con il tuo codice (Copia / Invia) e il campo per aggiungere un codice. Aggiungendo qualcuno gli arriva una **richiesta di amicizia**: la vede in "📨 Richieste" (pallino sul pulsante Profilo) e ricambia con "✅ Accetta", senza mandarti il suo codice
- **🏆 Classifiche**: 🌍 Mondo o 👥 Amici, per ⭐ Fama, 💰 Soldi guadagnati, 🧰 Lavoretti, 🏢 Attività, 🍔 Clienti serviti
- Server (`~/quartiere-ostile-3d-leaderboard/server.js`, solo chiavi `hustle:`): `stats` nel profilo del giocatore, classifiche `hustle:lb:money|jobs|biz|served` (`/leaderboard?game=hustle&kind=…`), richieste `hustle:req:<id>` (`POST /leaderboard/friend-request`, `GET /leaderboard/friend-requests`, `POST /leaderboard/friend-answer`)

### Dove toccare e oggetti solidi
- Niente cerchi sullo schermo: **l'oggetto che serve pulsa** (il suo colore si accende e si spegne, `PulseGlow` / bagliore dei lavoretti): piano gli oggetti ancora da usare, forte e veloce quello che puoi usare adesso (anche l'auto del lavaggio, le postazioni delle attività, lavello, pile di piatti e scolapiatti, sporco e oggetti nelle case). Quando l'azione diventa disponibile il telefono vibra un attimo; la scritta in alto comincia con il gesto ("👆 Tocca" / "✊ Tieni premuto")
- **Cerchio a terra dove stare**: nei lavoretti un cerchio giallo davanti al prossimo oggetto, appena fuori dal suo ingombro, dal lato da cui arrivi la prima volta e poi fermo lì; diventa verde e pulsa quando sei abbastanza vicino. Nelle attività è il tappetino colorato della postazione, nella cucina del lavapiatti l'anello verde. Il cerchio a terra c'è solo per le azioni veloci ("tocca"), non per quelle da tenere premute. In città: cerchio a terra davanti alle persone con il "!" e agli ingressi (casa, attività, agenzia, concessionaria, lotti in vendita…) entro 10 m, giallo; verde e pulsante quando puoi entrare o parlare (la persona pulsa)
- **Oggetti solidi nei lavoretti** (`userData.solid`, `JobRun.collide`): auto, cespugli (anche tagliati), bidone, edicola e negozio dei pacchi, recinzione e pilastri, scivolo, tavolino, vasi grandi. Restano attraversabili quelli piccoli o bassi: foglie, cassette della posta, barattoli, cassetta degli attrezzi, spruzzino, avvolgitubo, secchio, aiuole. Ogni punto dei lavoretti resta raggiungibile a piedi (provati 838 punti)
- Tutorial del lavapiatti: in cucina il fumetto segue le pile (prima restava fermo su "entra in cucina")

### Comandi: metà per muoversi, metà per le azioni
- Nessun pulsante azione: lo schermo è diviso a metà. Nella metà **sinistra** si trascina il dito per muoversi (il joystick compare dove lo appoggi); toccare o tenere premuto in un punto qualsiasi della metà **destra** fa partire l'azione o l'interazione disponibile (i pulsanti dell'interfaccia restano pulsanti). Un tocco vale solo per un attimo: se lì per lì non c'è niente da fare, non resta "in sospeso". Sali/Scendi sta nell'angolo in basso
- Opzioni → **🔁 Inverti joystick e azioni**: ci si muove a destra e si agisce a sinistra
- Restano: oggetto che pulsa, cerchio a terra dove stare, scritta in alto, cerchietto sopra la testa per "tieni premuto"
- Benvenuto: una riga spiega le due metà; chiuso il benvenuto, per qualche secondo le due metà si illuminano ("🕹️ Trascina qui per muoverti" / "👆 Tocca qui per parlare, entrare e lavorare"). Nei tutorial la manina tocca la metà delle azioni
- Imbianchino: le cose del giardino stanno in fila contro la casa (girate o un po' più piccole se serve), lungo il muretto resta sempre un corridoio libero di 1,5 m per dipingerlo dall'interno

### Visuale sempre libera
- Regola: nessun riquadro fisso, avviso o fumetto copre il personaggio, il campo attorno e gli obiettivi (i messaggi a comparsa rapida stanno al centro, sopra il personaggio, e spariscono in fretta)
- I messaggi (prima a metà schermo, fino a 4 insieme) ora sono uno alla volta, al massimo 2 righe, a colori pieni con testo bianco grande, bordo bianco e un alone quando arrivano (verde fatto, giallo soldi, rosso problema, blu informazione), al centro dello schermo un po' sopra la metà (sopra il personaggio, sotto i riquadri in alto; mai sopra i pulsanti a destra né sopra il pannello a sinistra in orizzontale). I riquadri fissi, il tutorial e la scritta dell'azione restano nella colonna in alto a sinistra
- Feste ed eventi del giorno: non più un'etichetta a parte sotto la data, ma una riga piccola dentro l'etichetta della data (toccandola si apre il calendario)
- In città la visuale mette il personaggio al centro della parte di schermo libera dai riquadri e dai pulsanti; nelle attività, nelle case dei clienti e nella cucina del lavapiatti la stanza si inquadra lasciando liberi i riquadri in alto

### Lavoretti come minigiochi (in corso)
- I lavoretti diventano minigiochi in una **scena separata** dalla città, giocati **in prima persona** (`src/minigames/arena.ts`): accettato il lavoretto si entra nella scena, a fine lavoro (o rinunciando) si torna in città dove si era. La scena sta lontanissima dalla città (la nebbia la nasconde): si riusano personaggio, luci, cielo e tutta la logica dei lavoretti (fasi, tutorial, oggetti solidi e che pulsano, cerchio a terra). Niente minimappa né freccette nella scena
- Comandi in prima persona (solo nei lavoretti): **rettangolo in basso a sinistra = joystick** (avanti = dove guardi); **tutto il resto dello schermo (anche la parte alta) = sguardo** (trascinare; tutta la larghezza dello schermo = mezzo giro); **le azioni si fanno toccando l'oggetto (quello che pulsa) in un punto preciso**: lì vince sempre l'azione, anche se l'oggetto sta sopra il rettangolo del joystick. Tocco = "tocca"; per "tieni premuto" (tagliare, verniciare, lavare) il dito deve restare sulla parte da lavorare: se scivola fuori l'azione si ferma, se torna sopra riprende. Toccare il vuoto, il terreno o il cerchio a terra non fa azioni. Conta solo l'oggetto vero (non il suo riquadro), con un margine di circa 14 px per la punta del dito (`UI.actionHit`, `Input.onTargetHit`); le macchie sull'auto si toccano direttamente. Il rettangolo è invisibile (metà larghezza, alto circa un terzo dello schermo); con "Inverti joystick e azioni" va a destra. Niente cerchio in mezzo alla vista: mentre si tiene premuto si riempie di verde la scritta dell'azione in alto. Campo visivo largo (circa 80° in orizzontale anche col telefono in verticale). La testa si gira da sola verso l'obiettivo solo dopo 3 s fermo e solo se l'obiettivo non si vede. Joystick a prova di blocco
- **Giardinaggio** (fatto): lotto 26×22 m con la casa del cliente un po' indietro, giardino davanti, dietro e ai lati, vialetto dal cancello alla porta, muretto sul confine, strada e vicinato fuori. Cespugli da tagliare 5–14 (con il livello) e 3–6 ostacoli (alberelli, vasi, tavolino, aiuole, siepi) in posizioni sempre diverse
- **Imbianchino** (fatto): stesso lotto, il muretto è tutto il confine. Quanto se ne dipinge dipende dal livello: Liv. 1–2 solo il davanti (8 tratti), Liv. 3 davanti + un lato, Liv. 4–5 davanti + i due lati, dal Liv. 6 anche il retro (31 tratti). Le cose da coprire con i teloni sono 2 + il livello (max 10), sparse nel giardino lontano dal muretto; il colore della vernice cambia ogni volta
- **Grandezza del lotto secondo il livello** (`lotSize`): Liv. 1 16×13,5 m (meno di metà di prima), poi cresce piano fino a 28×24 m; la casa è in proporzione; cespugli, ostacoli, tratti di muretto e teloni crescono insieme (Liv. 1: 6 cespugli e 2 ostacoli; muretto davanti 4 tratti e 3 teloni). Regola per tutti i lavori: spazio sufficiente per muoversi ma mai troppo
- **Il quartiere vero**: fuori dal muretto c'è la parte di città attorno alla casa dove si è accettato il lavoretto (la città annota ogni modello piazzato, `City.placed`): la stessa casa (stesso modello), le stesse vie, case, palazzi, alberi e lampioni, girati in modo che la casa guardi il cancello. Il lotto è più grande della tessera vera: tutto attorno si sposta quanto serve e strade e marciapiedi accanto al lotto si allungano, senza buchi. Un lampione davanti al cancello si sposta di lato
- **Lavaggio auto** (fatto): le auto sono parcheggiate nel cortile davanti alla casa, ai lati del vialetto; Liv. 1–3 una sola auto (lotto 14×15 m), Liv. 4–5 due auto, dal Liv. 6 tre auto (lotto 25×15 m). **Si tocca direttamente l'auto**: sulla carrozzeria ci sono macchie di sporco in punti sempre diversi (fianchi, muso, coda, cofano e tetto), 5 al Liv. 1 fino a 10 per auto; tenendo il dito su una macchia (o passandoci sopra) si insapona (se togli il dito prima, la macchia resta con un anello giallo che mostra quanto manca), poi si sciacqua la schiuma e si asciugano le gocce. Le macchie stanno sempre sulla carrozzeria vera (un raggio dal riquadro dell'auto trova la superficie; niente macchie dentro la scocca o nascoste). Toccare l'auto funziona in qualsiasi punto dello schermo e non gira lo sguardo; altrove il dito gira lo sguardo come sempre (`Task.aim`, `Input.onActionClaim`). Spruzzino, straccio e avvolgitubo ai lati della casa
- **Consegne e giornali** (fatto, `src/minigames/street.ts`): una via del quartiere con le case sui due lati (i modelli delle case e dei palazzi più vicini al posto del lavoretto), marciapiedi, lampioni, alberi e la via che continua fino all'orizzonte. All'inizio della via il negozio dei pacchi o l'edicola; i giornali si imbucano nella cassetta blu sul marciapiede delle case da servire; i pacchi si portano fino alla porta di casa (vialetto, zerbino giallo davanti alla porta, il pacco resta lì). Gli indirizzi sono distanti tra loro (almeno una casa e mezza, mai uno dopo l'altro: la via è più lunga) e la linea tratteggiata porta sempre al prossimo. Nella via si può andare in veicolo (pulsante Sali/Scendi), ma per imbucare o consegnare bisogna scendere ("Scendi dal veicolo per consegnare"). Consegne: 2 al Liv. 1, fino a 6; giornali: 3 al Liv. 1, fino a 10. La via è lunga quanto serve (2–6 case per lato): poche consegne, via corta
- **Lavapiatti** in prima persona: la cucina del ristorante chiuso è una stanza chiusa (pareti alte, soffitto con le lampade); lo sguardo si gira da solo verso la pila di piatti, il lavello o lo scolapiatti; le scritte vicine agli occhi spariscono. Tempo 12 s per pila + 10
- Ora **tutti i lavoretti sono in prima persona**. In terza persona restano le attività con il bancone e gli ordini di pulizie e traslochi nelle case dei clienti

- Ogni minigioco avrà un modo suo di giocare (per ora il lavaggio auto: si tocca la macchina)

### Strada e obiettivi
- La linea tratteggiata verso l'obiettivo segue le strade (percorso più breve sulle tessere di strada, `City.route`), gira agli incroci e finisce sull'obiettivo. Se esci dalla strada sparisce e restano le frecce
- Dalla lista delle attività (🛒 In vendita) un lotto si può impostare come obiettivo sulla mappa ("📍 Imposta come obiettivo"), per andare a comprarlo
- Prodotti delle attività: si vedono solo quelli già disponibili; quelli che servono un ampliamento compaiono quando lo compri
- Missioni settimanali più difficili e meno ricche per unità: 30–40 lavoretti, 3 stelle in 15–20, 3 lavoretti di ogni tipo, 120–180 clienti, guadagna ~€3.000 (premio 20%)
- Personale delle attività diviso per mansione: un titoletto per reparto (cuochi, cassieri, poi magazzinieri e camerieri, infine il manager) con quanti sono; se manca qualcuno in un reparto che serve compare "Nessuno: serve almeno un dipendente qui". Anche i candidati del giorno sono divisi per mansione. Le mansioni che all'attività non servono non si vedono proprio (né reparto, né candidati, né spiegazione): magazziniere solo dal 1° ampliamento, cameriere solo dal 2° (quando c'è la sala); le attività senza locale mostrano solo i loro reparti e il manager
- **Fuori dalle attività** (mentre ci si lavora dentro): come nei lavoretti, attorno al locale c'è il quartiere vero attorno al suo lotto (stesse vie, case, palazzi, parchi, alberi e lampioni della città), girato in modo che la strada sia davanti al bancone, da dove arrivano i clienti; cielo e nebbia seguono l'ora del giorno come in città (`buildSurroundings` in src/world/surroundings.ts, usato anche dai minigiochi). Food truck: si lavora dentro il furgone parcheggiato nel parco (prato, selciato davanti per la fila, ruote e cabina di guida visibili). Negozi: la stanza è dentro il palazzo (muri e tetto con condizionatori dietro e ai lati, tende colorate ai lati della vetrina), marciapiede davanti. Lo spazio davanti è più profondo solo col secondo ampliamento (la sala con i tavoli)
- **Negozio di ceramiche** (prima "Laboratorio artigiano", stesso tipo `artigianato`): funziona come prima (bancone, postazioni, clienti, dipendenti). Prodotti: 🏺 Vasi decorati (argilla → tornio → fornace → pittura), 🥣 Ciotole smaltate dal 1° ampliamento (… → smaltatura → fornace), ☕ Tazze dipinte dal 2° (… → banco decori → fornace). Ceramiche disegnate nel gioco (`world/ceramics.ts`, modelli `proc:`). Le partite vecchie si convertono da sole: sedie → ciotole, gioielli → tazze (con le scorte)
- **Ordini speciali** (scheda ✨ Ordini speciali nella gestione del negozio di ceramiche, `sim/specials.ts`): ogni giorno 3 vasi su commissione ben pagati (forma, smalto, ricompensa, difficoltà, tempo); le forme difficili (vaso slanciato, bottiglia) compaiono salendo di livello in artigianato. Li fa **solo il giocatore**, mai i dipendenti. "Realizza" apre il laboratorio del negozio in prima persona (`world/pottery.ts`), con gli stessi comandi dei lavoretti: prendi l'argilla → mettila sul tornio → **modella**: l'argilla gira e tenendo il dito su un punto del vaso lì si stringe (più piano vicino alla forma giusta, le fasce già a posto accanto quasi non si toccano); in alto a destra, al posto della minimappa, c'è la **foto del vaso richiesto** con la sagoma attuale tratteggiata sopra e la percentuale di somiglianza; "✅ Fatto" dal 70% (da solo al 96%), "♻️" per reimpastare → prendi il vaso → **essiccatoio** (5 s) → banco pittura → **dipingi** tenendo il dito sul vaso (si colora dove passi) → **incarta** (tieni premuto al banco dell'incarto) → lascia il pacco sul **ripiano delle consegne**. Stelle: somiglianza alla foto (3 stelle dal 92%) e tempo. Ricompensa nell'incasso del negozio, esperienza e fama di artigianato

### Prossimi passi proposti
- Altre attività (panificio, pulizie, traslochi, artigianato) e altri lavoretti
- Offerte d'acquisto casuali per le attività redditizie
- Missioni settimanali, veicoli (bici → scooter → auto), più case acquistabili
- Personalizzazione del personaggio, suoni e musica
