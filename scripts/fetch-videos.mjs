// チャンネルの全動画（タイトル・公開日・長さ・概要欄）を取得して data/videos.json を更新する
// APIキー不要（YouTube の公開ページと同じ情報を読む）。既に取得済みの動画は再取得しない
// 使い方: npm run fetch   （全件取り直すときは: node scripts/fetch-videos.mjs --all）
import fs from 'node:fs';

const HANDLE = '@bocchi-g-women';
const OUT = 'data/videos.json';
const ctx = { client: { clientName: 'WEB', clientVersion: '2.20251001.00.00', hl: 'ja', gl: 'JP' } };

const yt = (endpoint, body) =>
  fetch(`https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ context: ctx, ...body }),
  }).then((r) => {
    if (!r.ok) throw new Error(`${endpoint}: ${r.status}`);
    return r.json();
  });

// 1. ハンドル → チャンネルID
const resolved = await yt('navigation/resolve_url', { url: `https://www.youtube.com/${HANDLE}` });
const channelId = resolved.endpoint?.browseEndpoint?.browseId;
if (!channelId) throw new Error(`チャンネルが見つかりません: ${HANDLE}`);

// 2. 「動画」タブを最後までたどって videoId を集める（一覧に出ているタイトルと長さも控えておく）
const listed = new Map();
const grab = (items) =>
  items.flatMap((i) => {
    const l = i.richItemRenderer?.content?.lockupViewModel;
    if (!l?.contentId) return [];
    const len = JSON.stringify(l).match(/"text":"(\d+:\d\d(?::\d\d)?)"/)?.[1];
    listed.set(l.contentId, { title: l.metadata?.lockupMetadataViewModel?.title?.content ?? '', len });
    return [l.contentId];
  });
const nextToken = (items) => items.at(-1)?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;

const first = await yt('browse', { browseId: channelId, params: 'EgZ2aWRlb3PyBgQKAjoA' });
const tab = first.contents.twoColumnBrowseResultsRenderer.tabs.find((t) => t.tabRenderer?.content?.richGridRenderer);
let items = tab.tabRenderer.content.richGridRenderer.contents;
const ids = grab(items);
for (let tok = nextToken(items); tok; tok = nextToken(items)) {
  const r = await yt('browse', { continuation: tok });
  items = r.onResponseReceivedActions?.[0]?.appendContinuationItemsAction?.continuationItems ?? [];
  ids.push(...grab(items));
}
if (!ids.length) throw new Error('動画の一覧が取れませんでした');
console.log(`${ids.length} 本の動画を見つけました`);

// 予備：チャンネルの RSS（新しい15本の公開日時・概要欄）。
// GitHub のサーバーからだと YouTube が動画の詳細を返さないことがあるため、そのときはこちらを使う
const unxml = (t = '') => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const rss = new Map();
try {
  const xml = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`).then((r) => r.text());
  for (const e of xml.split('<entry>').slice(1)) {
    const g = (t) => e.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`))?.[1];
    const id = g('yt:videoId');
    if (id) rss.set(id, { title: unxml(g('title')), publishedAt: new Date(g('published')).toISOString(), description: unxml(g('media:description')) });
  }
} catch (e) {
  console.warn('RSS が読めませんでした:', e.message);
}

// 3. 各動画の詳細（未取得のものだけ）
const all = process.argv.includes('--all');
const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')).filter((v) => !v.sample) : [];
// タイトルや公開日が空のもの（取得に失敗したもの）は取り直す
const have = new Map(all ? [] : old.filter((v) => v.title && v.publishedAt).map((v) => [v.videoId, v]));
const todo = ids.filter((id) => !have.has(id));

async function detail(videoId) {
  const p = await yt('player', { videoId }).catch(() => ({}));
  const d = p.videoDetails ?? {};
  const m = p.microformat?.playerMicroformatRenderer ?? {};
  const r = rss.get(videoId) ?? {};
  const l = listed.get(videoId) ?? {};
  // 長さ：詳細が無いときは一覧の「8:04」から
  let sec = Number(d.lengthSeconds ?? 0);
  if (!sec && l.len) sec = l.len.split(':').reduce((a, n) => a * 60 + Number(n), 0);
  const v = {
    videoId,
    title: d.title || r.title || l.title || '',
    publishedAt: m.publishDate || m.uploadDate || r.publishedAt || '',
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    description: d.shortDescription || r.description || '',
    duration: `PT${Math.floor(sec / 60)}M${sec % 60}S`,
  };
  // 公開日もタイトルも分からないときは保存しない（次回また取りに行く）
  if (!v.title || !v.publishedAt) throw new Error(`詳細が取れませんでした: ${videoId}`);
  if (!d.title) console.log(`\n  ${videoId} は予備の情報（RSS・一覧）で保存しました`);
  return v;
}

for (let i = 0; i < todo.length; i += 6) {
  const batch = await Promise.all(todo.slice(i, i + 6).map((id) => detail(id).catch((e) => (console.warn(`\n  ${e.message}`), null))));
  for (const v of batch) if (v) have.set(v.videoId, v);
  process.stdout.write(`\r詳細を取得中 ${Math.min(i + 6, todo.length)}/${todo.length}`);
}
if (todo.length) process.stdout.write('\n');

const videos = ids.map((id) => have.get(id)).filter(Boolean);
videos.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
fs.writeFileSync(OUT, JSON.stringify(videos, null, 2) + '\n');
console.log(`${videos.length} 本を ${OUT} に保存しました（新規 ${todo.length} 本）`);
