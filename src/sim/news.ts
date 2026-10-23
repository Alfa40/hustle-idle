import { bus } from './bus';
import { day, type GameState, type NewsItem } from './state';

/**
 * Notizie (tasto 📰 Notizie): tutto quello che succede, da leggere con calma — eventi del calendario, resoconti
 * pronti, conti di fine mese, crisi e fallimenti, imprevisti, lavori dei terreni. Restano le ultime NEWS_MAX;
 * quelle non lette (`id` > `newsSeen`) accendono il pallino sul tasto.
 */
export const NEWS_MAX = 60;

export function addNews(s: GameState, n: Omit<NewsItem, 'day' | 'id'>) {
  s.news ??= [];
  s.newsSeq = (s.newsSeq ?? 0) + 1;
  s.news.unshift({ ...n, id: s.newsSeq, day: day(s) });
  s.news.length = Math.min(s.news.length, NEWS_MAX);
  bus.emit('news');
}

/** notizie arrivate dall'ultima volta che si è aperto il tasto */
export const unreadNews = (s: GameState) => (s.news ?? []).filter((n) => n.id > (s.newsSeen ?? 0)).length;

export function markNewsRead(s: GameState) {
  s.newsSeen = s.newsSeq ?? 0;
  bus.emit('news');
}
