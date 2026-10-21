/**
 * Aggiornamenti: il gioco aperto dalla Home spesso non si ricarica davvero (il telefono riprende la pagina rimasta
 * in memoria) e il sito tiene la pagina in cache per qualche minuto. Così si controlla da soli se c'è una versione
 * nuova: all'avvio, quando si torna nel gioco e ogni 5 minuti si legge `version.json` (scritto a ogni build da
 * vite.config.ts) senza cache. Se è cambiata:
 * - nella schermata iniziale, o tornando nel gioco quando non si sta facendo niente di importante, si salva e si
 *   ricarica subito;
 * - altrimenti compare in alto "🔄 Nuova versione: tocca per aggiornare".
 * La pagina si ricarica con `?v=<versione>`: un indirizzo nuovo, che la cache del telefono non ha.
 */

declare const __BUILD__: string;
export const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';

async function latest(): Promise<string | null> {
  try {
    const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as { build?: string };
    return typeof j.build === 'string' ? j.build : null;
  } catch {
    return null;
  }
}

const TRIED_KEY = 'hustle.updTried';

function go(build: string) {
  try {
    sessionStorage.setItem(TRIED_KEY, build);
  } catch {
    /* niente */
  }
  const url = new URL(location.href);
  url.searchParams.set('v', build);
  location.replace(url.toString());
}

export interface UpdateHooks {
  /** si può ricaricare adesso senza disturbare (schermata iniziale; o appena tornati nel gioco, `resumed`, senza lavoretti né tavoli) */
  canReload(resumed: boolean): boolean;
  /** prima di ricaricare (salvare la partita) */
  beforeReload(): void;
}

export function startUpdateCheck(h: UpdateHooks) {
  let pill: HTMLButtonElement | null = null;
  let found: string | null = null;
  const reload = (b: string) => {
    try {
      h.beforeReload();
    } catch {
      /* si ricarica comunque */
    }
    go(b);
  };
  const check = async (resumed: boolean) => {
    const b = found ?? (await latest());
    if (!b || b === BUILD) return;
    found = b;
    // già ricaricato una volta per questa versione e ancora quella vecchia (cache lenta): niente giri a vuoto, c'è il tasto
    let tried = '';
    try {
      tried = sessionStorage.getItem(TRIED_KEY) ?? '';
    } catch {
      /* niente */
    }
    if (tried !== b && h.canReload(resumed)) {
      reload(b);
      return;
    }
    if (pill) return;
    pill = document.createElement('button');
    pill.className = 'upd-pill';
    pill.textContent = '🔄 Nuova versione: tocca per aggiornare';
    pill.addEventListener('click', () => reload(b));
    document.body.appendChild(pill);
  };
  setTimeout(() => void check(false), 3000);
  setInterval(() => void check(false), 5 * 60_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void check(true);
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) void check(true);
  });
}
