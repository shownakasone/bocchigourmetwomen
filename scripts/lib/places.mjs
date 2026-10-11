// お店の位置検索（Google マップ検索 → 名前が一致するものだけ採用）
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export async function searchPlaces(q) {
  const r = await fetch('https://www.google.com/search?tbm=map&hl=ja&gl=jp&q=' + encodeURIComponent(q), { headers: { 'User-Agent': UA, 'Accept-Language': 'ja' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = JSON.parse((await r.text()).replace(/^\)\]\}'\n/, '').replace(/\/\*""\*\/\s*$/, ''));
  const out = [];
  const walk = (a, d) => {
    if (!Array.isArray(a) || d > 14) return;
    if (typeof a[11] === 'string' && Array.isArray(a[9]) && typeof a[9][2] === 'number') {
      out.push({ name: a[11], lat: a[9][2], lng: a[9][3], addr: typeof a[39] === 'string' ? a[39] : (typeof a[18] === 'string' ? a[18] : ''), cat: Array.isArray(a[13]) ? a[13].join('/') : '' });
      return;
    }
    for (const x of a) walk(x, d + 1);
  };
  walk(j, 0);
  return out.slice(0, 5);
}

// 表記ゆれ（藪/薮、イブ/イヴ、ラーメン/らーめん など）をそろえる
const FOLD = [[/薮/g, '藪'], [/ヴ/g, 'ブ'], [/[ぁ-ん]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)], [/煮干し/g, '煮干'], [/秋刀魚/g, 'サンマ'], [/らあめん|らぁめん|ラァメン|ラアメン/g, 'ラーメン'], [/é/g, 'e']];
export const norm = (s) => FOLD.reduce((t, [re, to]) => t.replace(re, to), s.normalize('NFKC').toLowerCase()).replace(/[\s・'’"「」『』\-ー〜~!！&.、。/]/g, '');
const GENERIC = /(中華ソバ|中華蕎麦|ラーメン|ラ麺|拉麺|麺屋|メン屋|麺処|メン処|麺房|ソバ処|蕎麦処|喫茶店|喫茶|純喫茶|珈琲店|カフェ|cafe|大衆食堂|オ食事処|御食事処|食事処|ゴハン処|食堂|レストラン|焼肉|中華飯店|中華料理|中国料理|トンカツ|本店|支店|店)/g;
const variants = (s) => {
  const inner = [...s.matchAll(/[（(](.*?)[）)]/g)].map((m) => m[1]);
  const outer = s.replace(/[（(].*?[）)]/g, ' ');
  return [outer, ...inner].map(norm).filter(Boolean);
};
const core = (s) => s.replace(GENERIC, '');
const bigrams = (s) => { const g = []; for (let i = 0; i < s.length - 1; i++) g.push(s.slice(i, i + 2)); return g.length ? g : [s]; };
function dice(a, b) {
  const x = bigrams(a), y = bigrams(b);
  let hit = 0; const pool = [...y];
  for (const g of x) { const i = pool.indexOf(g); if (i >= 0) { hit++; pool.splice(i, 1); } }
  return (2 * hit) / (x.length + y.length);
}
function score1(a, b) {
  const x = core(a), y = core(b);
  if (!x || !y) return a === b ? 1 : 0;
  if (x === y) return 1;
  const [s, l] = x.length < y.length ? [x, y] : [y, x];
  if (s.length >= 2 && l.includes(s)) return 0.7 + 0.3 * (s.length / l.length);
  if (s.length === 1 && l.startsWith(s) && l.length <= 4) return 0.6;
  return dice(x, y);
}

// 店名がどれくらい一致するか（0〜1）。かっこ内の読み・支店名・ジャンル語を考慮
export function nameScore(a, b) {
  let best = 0;
  for (const x of variants(a)) for (const y of variants(b)) best = Math.max(best, score1(x, y));
  return best;
}

export function pickPlace(shop, hits) {
  const inArea = (h) => !shop.city || (h.addr ?? '').includes(shop.city.replace(/^(.+?郡)/, '')) || (h.addr ?? '').includes(shop.pref);
  const scored = hits.map((h) => ({ h, s: nameScore(shop.name, h.name) })).filter(({ h, s }) => s >= 0.5 && inArea(h)).sort((a, b) => b.s - a.s);
  return scored[0]?.h ?? null;
}
