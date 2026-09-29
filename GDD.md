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

## 3. Controlli e telecamera

- **Visuale isometrica dall'alto** che segue il personaggio.
- **Due modi di controllo, entrambi attivi:** joystick virtuale oppure tocco sul punto di destinazione (il personaggio ci va da solo).
- Si interagisce avvicinandosi: NPC, porte degli edifici posseduti, postazioni dei mini-giochi.

## 4. Mappa

- **Una sola città** all'inizio, divisa in **zone** (per esempio periferia, residenziale, centro, zona commerciale).
- **La posizione conta:** ogni lotto ha un moltiplicatore di **passaggio/domanda** e un **costo** (affitto o acquisto). In centro ci sono più clienti ma costa di più.
- Le attività si aprono in **lotti disponibili**, distribuiti nelle varie zone.
- Il player **entra nei propri edifici dalla porta d'ingresso**. Dentro c'è la scena interna dell'attività (cucina, cassa, magazzino…).

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
- Laboratorio di artigianato

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
| Artigianato | laboratorio, lavoretti artigianali |
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
- **Missioni giornaliere** (lavori brevi) e **settimanali** (lavori lunghi e strutturati, per esempio catering per un matrimonio o il trasloco di un'azienda).
- Il tipo di missione, la ricompensa e la difficoltà cambiano in base a **fama ed esperienza** del player e si rinnovano ogni giorno o ogni settimana.

### Classifica mondiale
- Dal Profilo → **🏆 Classifica mondiale**: primi 50 giocatori per fama totale (somma della fama di tutte le categorie), con nome e rango; la propria riga è evidenziata e compare anche se si è fuori dai primi 50.
- Al primo accesso si sceglie il nome (max 20 caratteri, modificabile). Identità anonima per dispositivo: un solo posto per dispositivo, vale la partita con più fama.
- Il punteggio si invia in automatico col salvataggio (al massimo una volta al minuto) e all'apertura della classifica; senza rete il gioco continua normalmente.
- Backend: lo stesso servizio Render + Upstash Redis della classifica di Magic Trip (`crazy-town.onrender.com`), con chiavi separate (`hustle:leaderboard`, `hustle:player:<id>` con logo e attività, `hustle:code:<codice>`; `?game=hustle`, `/leaderboard/friends`).

### Logo, amici e città condivisa
- **Logo** (uno per partita, `state.logo`, src/logo.ts): dal Profilo → 🎨 Il tuo logo. Si sceglie forma (cerchio, scudo, quadrato, stella, esagono), colore di sfondo, simbolo (30 emoji), iniziali (max 3) e il loro colore, più il nome del giocatore. Compare sopra le insegne delle proprie attività, nel profilo, in classifica e sulla mappa degli amici
- **Foto come logo**: si carica una foto dal telefono e la si ritocca (trascinare per spostarla, zoom, rotazione, luminosità, contrasto, colori, bianco e nero) dentro la forma scelta; salvata come JPEG 160×160. La foto la vedono solo gli amici: nella classifica mondiale (pubblica) compare il logo disegnato
- **Amici**: ogni dispositivo ha un codice amico di 6 caratteri (ricavato dall'id anonimo). Nella classifica, scheda 👥 Amici: il proprio codice (copia / invia con la condivisione del telefono), aggiunta di un amico col suo codice, classifica tra amici con i loghi, amici da togliere. L'amicizia è da una parte sola (vedi chi aggiungi)
- **Attività degli amici sulla tua mappa**: ogni 5 minuti si scaricano le attività degli amici; quelle su lotti liberi nella tua città compaiono con furgone/insegna, il nome e il logo dell'amico (🤝 nella mappa). Toccandole: scheda con l'amico e il posto (che resta acquistabile: se lo compri, la tua attività prende il posto di quella dell'amico). Se più amici hanno lo stesso lotto, si vede quello con più fama
- **Stesso posto, più attività**: se tu e i tuoi amici avete un'attività nello stesso posto, sui posteggi i furgoni stanno affiancati e ben separati (il tuo al centro, poi fino a 2 amici con più fama); sugli edifici ogni amico ha un piano in più sopra il tuo locale (fino a 3), più in alto chi ha più fama. Il furgone di un amico è aperto (tendone) e il suo piano ha le luci accese solo se sta giocando in quel momento (segnale "sto giocando" ogni minuto, valido 3 minuti); altrimenti serranda abbassata e finestre spente
- **Logo come marchio**: stampato grande sul tetto e sul fianco di ogni furgone (tuo e degli amici), sulla facciata dei locali sopra l'ingresso e sospeso sopra l'insegna
- **In futuro — città condivisa**: un server in tempo reale (WebSocket, come il co-op di Crazy Town) dove più amici giocano nella stessa città: ognuno con i propri lavoretti, attività e loghi; si vedono i personaggi degli altri muoversi, si può entrare nelle attività degli amici per guardarle lavorare e girare la città insieme. Servirà: stanze per gruppi di amici, lotti assegnati una volta sola per città, sincronizzazione di posizioni/animazioni e dello stato delle attività (il tempo di gioco condiviso), e regole per chi è offline (le sue attività continuano come ora in idle)

### Negozio (pulsante 🛍️ sotto Casa)
- **Concessionaria**: si comprano i veicoli da qui, senza andare in centro
- **Agenzia immobiliare**: 10 case in vendita (prezzo per zona: periferia ~9.000 €, residenziale ~15.000 €, centro ~26.000 €). Una casa comprata si può: 🏠 viverci (il pulsante Casa ti porta lì e lì dormi; la casa di partenza resta), 🔑 affittare (0,5% del prezzo al giorno, pagato a ogni nuovo giorno di gioco), vendere all'85%. Il 📍 mette il segnaposto sulla mappa
- **Stile e accessori**: 9 stili (i personaggi Kenney, il primo gratis) e accessori agganciati alla testa (seguono le animazioni), uno per parte del corpo: testa (cappellino, cilindro, corona), occhi (occhiali da sole, a cuore), collo (collana d'oro, di perle, sciarpa), schiena (zaino, mantello). Si comprano una volta per partita e si indossano/tolgono quando si vuole

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
- Guida nelle attività: riquadro in alto senza fasi né livelli: solo avvisi (freddo, pronto da ritirare, calore rimasto, ordini da preparare) e le capienze (piastra/forno x/y, pronti x/max). Niente percorso del singolo prodotto: con più prodotti in lavorazione sono le etichette delle postazioni a contare quanti prodotti ci sono (da prendere, sul fuoco ✅ pronti +in arrivo, da lavorare, da servire)
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
- Spiegazione prima di accettare: nella scheda del lavoretto un "mini video" mostra la procedura passo passo (icona grande, cosa fare, gesto animato: 👆 tocca, ✊ tieni premuto con barra che si riempie, 🚶 vai), con l'elenco numerato dei passi sotto (config/jobs.ts `steps`)
- Prima di arrivare nella zona di lavoro la barra dice "🚶 Vai alla zona di lavoro: segui le frecce"; se poi si esce, l'avviso compare accanto alla fase senza nasconderla
- Gli oggetti da usare nella fase attuale hanno il loro colore più acceso e chiaro che pulsa (niente luce esterna); la scena è leggermente più scura per farli risaltare: cassetta attrezzi, cespugli, bidone, cassette postali, lavello, secchio, muretto…
- Volantinaggio e consegne: al negozio c'è un espositore giallo dei volantini o una pila di pacchi; a ogni indirizzo una cassetta della posta su palo con bandierina, così il punto si trova subito

### Prossimi passi proposti
- Altre attività (panificio, pulizie, traslochi, artigianato) e altri lavoretti
- Offerte d'acquisto casuali per le attività redditizie
- Missioni settimanali, veicoli (bici → scooter → auto), più case acquistabili
- Personalizzazione del personaggio, suoni e musica
