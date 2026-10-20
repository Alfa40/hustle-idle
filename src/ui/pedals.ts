/**
 * Comandi da gioco di auto per i mezzi da lavoro con `pedals` (Autista): in basso a sinistra acceleratore e
 * freno (in quest'ordine), in basso a destra le frecce per girare. Si possono tenere premuti insieme (più dita).
 * Su PC: W/↑ acceleratore, S/↓ freno, A/← e D/→ per girare.
 */
export interface PedalState {
  gas: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
}

type Key = keyof PedalState;

const PEDAL = (grooves: number) =>
  `<svg viewBox="0 0 40 60" aria-hidden="true"><rect x="4" y="3" width="32" height="54" rx="8" fill="#4a4f63" stroke="#fff" stroke-width="3"/>${Array.from(
    { length: grooves },
    (_, i) => `<rect x="11" y="${12 + i * (36 / Math.max(1, grooves - 1))}" width="18" height="3.5" rx="1.75" fill="#8d93a8"/>`,
  ).join('')}</svg>`;
const ARROW = (dir: 1 | -1) =>
  `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="${dir < 0 ? 'M26 7 12 20l14 13' : 'M14 7l14 13-14 13'}" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function createPedals(state: PedalState) {
  const el = document.createElement('div');
  el.className = 'pedals';
  el.innerHTML = `
    <div class="pd-side pd-left">
      <button class="pd pd-gas" data-k="gas" aria-label="Acceleratore">${PEDAL(5)}<b>Gas</b></button>
      <button class="pd pd-brake" data-k="brake" aria-label="Freno">${PEDAL(3)}<b>Freno</b></button>
    </div>
    <div class="pd-side pd-right">
      <button class="pd pd-turn" data-k="left" aria-label="Gira a sinistra">${ARROW(-1)}</button>
      <button class="pd pd-turn" data-k="right" aria-label="Gira a destra">${ARROW(1)}</button>
    </div>`;
  // Col dito: a ogni tocco si guarda quali dita sono davvero sullo schermo e sopra quale tasto. Così un pedale
  // non resta mai premuto se il telefono perde il "dito alzato" (prima il gas poteva restare giù), e si può
  // far scivolare il dito da un tasto all'altro. Col mouse (PC) valgono i soliti clic tenuti premuti.
  let mouse: Key | null = null;
  const sync = (touches?: TouchList) => {
    const on = new Set<Key>();
    for (const t of Array.from(touches ?? [])) {
      const b = document.elementFromPoint(t.clientX, t.clientY)?.closest<HTMLElement>('.pedals .pd');
      if (b) on.add(b.dataset.k as Key);
    }
    if (mouse) on.add(mouse);
    for (const k of ['gas', 'brake', 'left', 'right'] as Key[]) state[k] = on.has(k);
    el.querySelectorAll<HTMLElement>('.pd').forEach((b) => b.classList.toggle('on', state[b.dataset.k as Key]));
  };
  const onTouch = (e: TouchEvent) => sync(e.touches);
  for (const t of ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const) window.addEventListener(t, onTouch, { passive: true });
  // sui tasti il tocco non deve far scorrere né zoomare la pagina
  el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  el.querySelectorAll<HTMLElement>('.pd').forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      mouse = b.dataset.k as Key;
      sync();
    });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  const mouseUp = () => {
    if (!mouse) return;
    mouse = null;
    sync();
  };
  window.addEventListener('pointerup', mouseUp);
  const off = () => {
    mouse = null;
    sync();
  };
  window.addEventListener('blur', off);
  document.addEventListener('visibilitychange', off);
  document.body.appendChild(el);
  document.body.classList.add('pedal-drive');
  return {
    el,
    remove() {
      window.removeEventListener('blur', off);
      document.removeEventListener('visibilitychange', off);
      window.removeEventListener('pointerup', mouseUp);
      for (const t of ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const) window.removeEventListener(t, onTouch);
      el.remove();
      document.body.classList.remove('pedal-drive');
      off();
    },
  };
}
