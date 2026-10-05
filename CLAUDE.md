# Hustle Idle — istruzioni per lo sviluppo

- Gioco idle per **telefono**, web app: Vite + TypeScript + Three.js, interfaccia HTML/CSS
  sopra la scena 3D. Design e stato dello sviluppo: `GDD.md`.
- **Layout: ogni schermata, nuova o modificata, deve seguire `LAYOUT.md`** (LayoutManager
  centrale in `src/ui/layout.ts`): verticale e orizzontale, scala in base al lato corto,
  safe area, niente `resize` o pixel fissi sparsi, prova con `debug.html` alle misure
  360×640, 390×844, 430×932, 768×1024 in entrambi gli orientamenti.
- **Scala del mondo**: le misure della città passano da `WS` (src/config/map.ts). Edifici, strade e distanze dalle tessere si moltiplicano per `WS`; personaggi, veicoli e oggetti di scena no. Nei lavoretti usare `frame()`/`zoneFor()` (già in scala).
- Testi del gioco in italiano. Numeri da bilanciare in `src/config/`.
- Si pubblica (push su GitHub → GitHub Pages) solo quando l'utente scrive "Pusha".
