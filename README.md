# Hustle Idle

Gioco idle/gestionale in terza persona (visuale isometrica), pensato per il telefono e giocabile nel browser.
Il documento di design è in [GDD.md](GDD.md).

## Avviare il gioco

```bash
npm install        # solo la prima volta
npm run dev        # avvia il server di sviluppo
```

- **Sul Mac:** apri l'indirizzo `Local` che compare nel terminale.
- **Sul telefono:** collegalo alla stessa rete Wi‑Fi del Mac e apri l'indirizzo `Network` (tipo `http://192.168.x.x:5173`).

`npm run build` crea la versione pubblicabile nella cartella `dist/`.

## Comandi di gioco

- **Telefono:** trascina il dito per muoverti (compare un joystick). Il pulsante giallo in basso a destra serve per le azioni: tocca, oppure tieni premuto quando lo chiede.
- **PC:** WASD o frecce per muoverti, E o spazio per l'azione.

## Struttura

```
src/
  config/      numeri e dati di gioco (bilanciamento, prodotti, lavori, eventi, mappa)
  sim/         logica senza grafica: stato e salvataggio, economia, calendario, offline
  world/       grafica 3D: città, personaggi, interno del food truck
  minigames/   lavori: giardino, consegne, lavapiatti
  ui/          interfaccia (HUD, pannelli, stile)
public/models/ modelli Kenney usati dal gioco (CC0)
assets-src/    pack Kenney completi originali (non in git)
```

Tutti i valori "tarabili" (tempi, prezzi, domanda, stipendi) sono in `src/config/`.

## Crediti

Modelli 3D: [Kenney.nl](https://kenney.nl) (CC0): Mini Characters, City Kit Commercial/Suburban/Roads, Car Kit, Food Kit, Furniture Kit.
