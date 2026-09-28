type Handler = (payload?: any) => void;
const handlers = new Map<string, Set<Handler>>();

export const bus = {
  on(ev: string, h: Handler) {
    let set = handlers.get(ev);
    if (!set) handlers.set(ev, (set = new Set()));
    set.add(h);
    return () => set!.delete(h);
  },
  emit(ev: string, payload?: any) {
    handlers.get(ev)?.forEach((h) => h(payload));
  },
};

export const toast = (text: string, kind: 'info' | 'good' | 'bad' | 'money' = 'info') =>
  bus.emit('toast', { text, kind });
