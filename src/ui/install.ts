/**
 * Consiglio "aggiungi alla schermata Home": compare ogni volta che il gioco è aperto
 * dal browser (non dall'icona sulla Home), con i passaggi giusti per il telefono in uso.
 * Su Android con Chrome c'è anche il pulsante per installarlo direttamente.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
// Chrome lo manda una volta sola, presto: lo teniamo da parte per il pulsante "Installa"
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPromptEvent;
  const b = document.querySelector<HTMLElement>('.inst-go');
  if (b) b.style.display = '';
});

/** Il gioco è aperto dall'icona sulla schermata Home (app installata). */
export function isInstalled() {
  const mm = (q: string) => window.matchMedia?.(q).matches;
  return mm('(display-mode: fullscreen)') || mm('(display-mode: standalone)') || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

type Platform = 'ios-safari' | 'ios-other' | 'android' | 'desktop';
function platform(): Platform {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

const STEPS: Record<Platform, [string, string][]> = {
  'ios-safari': [
    ['⬆️', 'Tocca il pulsante <b>Condividi</b> (il quadrato con la freccia) nella barra di Safari'],
    ['➕', 'Scorri e tocca <b>Aggiungi alla schermata Home</b>'],
    ['✅', 'Tocca <b>Aggiungi</b> in alto a destra: l\'icona di Hustle Idle compare sulla Home'],
  ],
  'ios-other': [
    ['⬆️', 'Tocca il pulsante <b>Condividi</b> nella barra degli indirizzi (in alto a destra)'],
    ['➕', 'Tocca <b>Aggiungi alla schermata Home</b> (se non c\'è, apri il link in <b>Safari</b>)'],
    ['✅', 'Tocca <b>Aggiungi</b>: l\'icona compare sulla Home'],
  ],
  android: [
    ['⋮', 'Tocca il menu <b>⋮</b> in alto a destra di Chrome'],
    ['📲', 'Tocca <b>Installa app</b> oppure <b>Aggiungi a schermata Home</b>'],
    ['✅', 'Conferma con <b>Installa</b>: l\'icona compare sulla Home'],
  ],
  desktop: [
    ['📱', 'Il gioco è fatto per il telefono: apri questo link dal tuo smartphone'],
    ['💻', 'Sul computer puoi installarlo con l\'icona <b>Installa</b> nella barra degli indirizzi di Chrome o Edge'],
  ],
};

/** Mostra il consiglio (se il gioco non è già aperto dalla Home). */
export function showInstallTip() {
  // mai nei test automatici e mai quando è già installato
  if (isInstalled() || navigator.webdriver) return;
  const p = platform();
  const el = document.createElement('div');
  el.className = 'inst-wrap';
  el.innerHTML = `<div class="inst">
    <img class="inst-icon" src="./icons/icon-192.png" alt="">
    <h2>📲 Metti Hustle Idle sulla schermata Home</h2>
    <p class="inst-why">Si gioca meglio come un'app vera:</p>
    <ul class="inst-list">
      <li>🖥️ <b>A schermo intero</b>, senza le barre del browser</li>
      <li>👆 Si apre <b>con un tocco</b> dall'icona, come le altre app</li>
      <li>💾 <b>Salvataggi più al sicuro</b>: il browser può cancellare i dati dei siti poco usati, l'app no</li>
      <li>⚡ Più fluido e senza tocchi che fanno scorrere la pagina</li>
    </ul>
    <button class="btn good full inst-go" style="${deferred ? '' : 'display:none'}">📲 Installa adesso</button>
    <div class="inst-steps">${STEPS[p].map(([i, t], n) => `<div class="inst-step"><span class="inst-n">${n + 1}</span><span class="inst-i">${i}</span><span>${t}</span></div>`).join('')}</div>
    ${p === 'ios-safari' ? '<div class="inst-arrow">⬇️ il pulsante Condividi è qui sotto</div>' : ''}
    <button class="btn sec full inst-later">Più tardi, gioco dal browser</button>
  </div>`;
  document.body.appendChild(el);
  const close = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 250);
  };
  el.querySelector('.inst-later')!.addEventListener('click', close);
  el.querySelector('.inst-go')!.addEventListener('click', async () => {
    if (!deferred) return;
    await deferred.prompt();
    const r = await deferred.userChoice;
    deferred = null;
    if (r.outcome === 'accepted') close();
  });
}
