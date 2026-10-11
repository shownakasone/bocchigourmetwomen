// 視聴者ごとの「行った」「行きたい」記録（端末の localStorage に保存）
export type Kind = 'visited' | 'want';
const KEY = 'bocchi-mylog-v1';

type Log = Record<Kind, string[]>;

export function load(): Log {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { visited: raw.visited ?? [], want: raw.want ?? [] };
  } catch {
    return { visited: [], want: [] };
  }
}

function save(log: Log) {
  try { localStorage.setItem(KEY, JSON.stringify(log)); } catch {}
}

export function has(kind: Kind, id: string) {
  return load()[kind].includes(id);
}

export function toggle(kind: Kind, id: string) {
  const log = load();
  const list = log[kind];
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1); else list.push(id);
  save(log);
  return i < 0;
}

// カード一覧に「行った」バッジを付ける
export function markCards(root: ParentNode = document) {
  const visited = new Set(load().visited);
  root.querySelectorAll<HTMLElement>('[data-shop-id]').forEach((el) => {
    el.classList.toggle('is-visited', visited.has(el.dataset.shopId!));
  });
}
