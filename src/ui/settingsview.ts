import { HUD_NAMES, setSetting, settings, SETTING_OPTIONS, type HudKey, type Settings } from '../settings';

type Choice = 'quality' | 'camera';
type Toggle = 'shadows' | 'outlines' | 'pointers' | 'minimap' | 'battery';

function segmented(key: Choice, label: string, hint: string) {
  const opts = SETTING_OPTIONS[key].map(
    ([v, n]) => `<button class="seg ${settings[key] === v ? 'on' : ''}" data-a="set:${key}|${v}">${n}</button>`,
  ).join('');
  return `<div class="card"><div class="row between"><b>${label}</b></div><div class="segs">${opts}</div><div class="muted small" style="margin-top:6px">${hint}</div></div>`;
}

function toggle(key: Toggle, label: string, hint: string) {
  const on = settings[key];
  return `<button class="card set-toggle" data-a="tog:${key}"><div style="flex:1;text-align:left"><b>${label}</b><div class="muted small">${hint}</div></div>
    <span class="switch ${on ? 'on' : ''}"><i></i></span></button>`;
}

/** Controlli delle impostazioni: uguali nella schermata iniziale e in partita. */
export function settingsHtml() {
  return [
    toggle('battery', '🔋 Risparmio batteria', 'Il gioco disegna 30 immagini al secondo (15 quando non tocchi lo schermo) e con un po\' meno dettaglio: consuma circa la metà.'),
    segmented('quality', '🎨 Qualità grafica', 'Se il telefono si scalda o va a scatti, prova Media o Bassa.'),
    toggle('shadows', '🌗 Ombre', 'Disattivale per più fluidità.'),
    toggle('outlines', '✏️ Contorni', 'Bordi scuri attorno agli oggetti: tutto più distinguibile. Spenti con qualità Bassa.'),
    segmented('camera', '🎥 Distanza della camera', 'Quanto vedi della città attorno al personaggio.'),
    toggle('pointers', '➡️ Freccette ai bordi', 'Indicano i lavoretti vicini e il segnaposto.'),
    toggle('minimap', '🗺️ Minimappa', 'La mappa piccola in alto a destra.'),
    hudHtml(),
  ].join('');
}

/** Ordine dei pulsanti a destra e quali stanno nel menu a tendina ☰. */
function hudHtml() {
  const n = settings.hudOrder.length;
  const rows = settings.hudOrder.map((k, i) => {
    const inMenu = settings.hudMenu.includes(k);
    return `<div class="hud-row ${inMenu ? 'in-menu' : ''}"><span class="hud-name">${HUD_NAMES[k]}</span>
      <button class="btn sm sec" data-a="hud:up|${k}" ${i === 0 ? 'disabled' : ''} aria-label="Su">▲</button>
      <button class="btn sm sec" data-a="hud:down|${k}" ${i === n - 1 ? 'disabled' : ''} aria-label="Giù">▼</button>
      <button class="btn sm ${inMenu ? 'purple' : 'sec'}" data-a="hud:menu|${k}">${inMenu ? '☰ Nel menu' : '👁️ Visibile'}</button></div>`;
  }).join('');
  return `<div class="card"><b>🧭 Pulsanti a destra</b><div class="muted small" style="margin:2px 0 8px">Cambia l'ordine con ▲▼ (dall'alto in basso). Quelli messi "nel menu" spariscono dalla colonna e si trovano toccando ☰ Menu: puoi metterci tutti i pulsanti, alcuni o nessuno.</div>
    ${rows}<button class="btn sm sec full" data-a="hud:reset|x" style="margin-top:8px">↺ Disposizione iniziale</button></div>`;
}

/** Gestisce un'azione `set:chiave|valore` o `tog:chiave`. */
export function settingsAction(a: string) {
  const [cmd, arg = ''] = a.split(':');
  if (cmd === 'set') {
    const [k, v] = arg.split('|') as [Choice, string];
    setSetting(k, v as Settings[Choice]);
  } else if (cmd === 'hud') {
    const [op, k] = arg.split('|') as [string, HudKey];
    const order = [...settings.hudOrder];
    const i = order.indexOf(k);
    if (op === 'up' && i > 0) [order[i - 1], order[i]] = [order[i], order[i - 1]];
    if (op === 'down' && i >= 0 && i < order.length - 1) [order[i + 1], order[i]] = [order[i], order[i + 1]];
    if (op === 'up' || op === 'down') setSetting('hudOrder', order);
    if (op === 'menu') setSetting('hudMenu', settings.hudMenu.includes(k) ? settings.hudMenu.filter((x) => x !== k) : [...settings.hudMenu, k]);
    if (op === 'reset') {
      setSetting('hudMenu', []);
      setSetting('hudOrder', ['biz', 'missions', 'profile', 'home', 'shop', 'settings', 'camera']);
    }
  } else if (cmd === 'tog') {
    const k = arg as Toggle;
    setSetting(k, !settings[k]);
  }
}
