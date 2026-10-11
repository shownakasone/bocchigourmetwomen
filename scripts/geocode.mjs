// data/shops.yaml で lat/lng が無いお店の位置を自動で補う
// 1. Google マップで「店名 + 市町村」を検索し、店名が一致すれば採用（住所も補完）
// 2. 住所があれば国土地理院の住所検索
// 3. OpenStreetMap(Nominatim) で「店名 + 市町村」を検索（1秒に1回まで）
// 4. 見つからなければ市町村の中心をおおよその位置（approx: true）にする
// 使い方: npm run geocode
import fs from 'node:fs';
import { load, dump } from 'js-yaml';
import { searchPlaces, pickPlace } from './lib/places.mjs';

const FILE = 'data/shops.yaml';
const CACHE = 'data/geocache.json';
const text = fs.readFileSync(FILE, 'utf8');
const header = text.match(/^(#.*\n|\s*\n)*/)[0];
const shops = load(text) ?? [];
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gsi(q) {
  const key = `gsi:${q}`;
  if (key in cache) return cache[key];
  const res = await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`);
  const [hit] = res.ok ? await res.json() : [];
  const val = hit ? { lat: hit.geometry.coordinates[1], lng: hit.geometry.coordinates[0], title: hit.properties.title } : null;
  cache[key] = val;
  await sleep(200);
  return val;
}

async function osm(q, city) {
  const key = `osm:${q}`;
  if (key in cache) return cache[key];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=jp&limit=5&accept-language=ja&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'bocchi-gourmet-archive/0.1 (local data build)' } });
  const hits = res.ok ? await res.json() : [];
  const hit = hits.find((h) => !city || h.display_name.includes(city));
  const val = hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  cache[key] = val;
  await sleep(1100);
  return val;
}

const round = (n) => Math.round(n * 1e5) / 1e5;
const clean = (name) => name.replace(/[（(].*?[）)]/g, '').trim();
let done = 0;
const todo = shops.filter((s) => (s.lat == null || (s.approx && process.argv.includes('--retry'))) && !s.draft && !s.nomap);
for (const s of todo) {
  let pos = null;
  let approx = false;
  try {
    const key = `gmap:${s.name}|${s.pref}${s.city}`;
    if (!(key in cache)) { cache[key] = await searchPlaces(`${clean(s.name)} ${s.pref}${s.city}`); await sleep(1200); }
    const hit = pickPlace(s, cache[key] ?? []);
    if (hit) { pos = hit; if (!s.address && hit.addr) s.address = hit.addr.replace(/^〒\d{3}-\d{4}\s*/, ''); }
  } catch {}
  if (!pos && s.address && /\d/.test(s.address)) pos = await gsi(s.address);
  if (!pos) pos = await osm(`${clean(s.name)} ${s.city}`, s.city);
  if (!pos && s.address) pos = await gsi(s.address);
  if (!pos) { pos = await gsi(`${s.pref}${s.city}`); approx = true; }
  if (pos) {
    s.lat = round(pos.lat);
    s.lng = round(pos.lng);
    if (approx) s.approx = true; else delete s.approx;
  }
  done++;
  process.stdout.write(`\r位置を調べています ${done}/${todo.length}`);
  if (done % 20 === 0) fs.writeFileSync(CACHE, JSON.stringify(cache));
}
process.stdout.write('\n');
fs.writeFileSync(CACHE, JSON.stringify(cache));

// lat/lng を visits の前に並べ直して保存
const order = ['id', 'name', 'pref', 'city', 'genre', 'address', 'lat', 'lng', 'approx', 'solo', 'closed', 'draft', 'visits'];
const sorted = shops.map((s) => Object.fromEntries(Object.entries(s).sort(([a], [b]) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99)));
fs.writeFileSync(FILE, header + dump(sorted, { lineWidth: -1, flowLevel: 4 }));
const located = shops.filter((s) => s.lat != null);
console.log(`位置あり ${located.length} 軒（うち おおよそ ${located.filter((s) => s.approx).length} 軒）`);
