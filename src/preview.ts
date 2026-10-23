// Anteprime delle modifiche proposte dai tester: stanno su un sito a parte (Cloudflare Pages), ognuna col suo
// indirizzo, es. https://proposta-12.hustle-anteprime.pages.dev (12 = numero della proposta su GitHub). Essendo un
// altro sito, il salvataggio è già separato da quello del gioco vero; qui si riconosce l'anteprima per tenerla
// fuori dalla classifica e scriverlo nel titolo della pagina.

const m = /^proposta-(\d+)\.hustle-anteprime\.pages\.dev$/.exec(location.hostname);
/** numero della proposta in anteprima, o null nel gioco vero */
export const previewPr = m ? Number(m[1]) : null;

if (previewPr !== null) document.title = `Anteprima #${previewPr} · ${document.title}`;

/**
 * Versione di prova (beta): sito a parte su Cloudflare Pages, https://beta.hustle-anteprime.pages.dev, costruito dal
 * ramo `beta` (.github/workflows/beta.yml). Come le anteprime: salvataggi suoi (altro sito), niente classifica né
 * account, e la partita developer c'è sempre (comandi rapidi per provare tutto in fretta).
 */
export const betaSite = location.hostname === 'beta.hustle-anteprime.pages.dev' || /[?&]beta\b/.test(location.search);
/** sito a parte (anteprima o beta): niente classifica, niente account, niente soldi veri del poker */
export const sandbox = previewPr !== null || betaSite;

if (betaSite) document.title = `Prova · ${document.title}`;
