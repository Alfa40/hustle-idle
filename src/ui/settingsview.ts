import { setSetting, settings, SETTING_OPTIONS, type Settings } from '../settings';

type Choice = 'quality' | 'camera';
type Toggle = 'shadows' | 'outlines' | 'pointers' | 'minimap';

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
    segmented('quality', '🎨 Qualità grafica', 'Se il telefono si scalda o va a scatti, prova Media o Bassa.'),
    toggle('shadows', '🌗 Ombre', 'Disattivale per più fluidità.'),
    toggle('outlines', '✏️ Contorni', 'Bordi scuri attorno agli oggetti: tutto più distinguibile.'),
    segmented('camera', '🎥 Distanza della camera', 'Quanto vedi della città attorno al personaggio.'),
    toggle('pointers', '➡️ Freccette ai bordi', 'Indicano i lavoretti vicini e il segnaposto.'),
    toggle('minimap', '🗺️ Minimappa', 'La mappa piccola in alto a destra.'),
  ].join('');
}

/** Gestisce un'azione `set:chiave|valore` o `tog:chiave`. */
export function settingsAction(a: string) {
  const [cmd, arg = ''] = a.split(':');
  if (cmd === 'set') {
    const [k, v] = arg.split('|') as [Choice, string];
    setSetting(k, v as Settings[Choice]);
  } else if (cmd === 'tog') {
    const k = arg as Toggle;
    setSetting(k, !settings[k]);
  }
}
