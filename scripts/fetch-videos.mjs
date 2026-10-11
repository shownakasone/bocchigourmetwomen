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

// 2. 「動画」タブを最後までたどって videoId を集める
const grab = (items) =>
  items.flatMap((i) => {
    const l = i.richItemRenderer?.content?.lockupViewModel;
    return l?.contentId ? [l.contentId] : [];
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
console.log(`${ids.length} 本の動画を見つけました`);

// 3. 各動画の詳細（未取得のものだけ）
const all = process.argv.includes('--all');
const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')).filter((v) => !v.sample) : [];
const have = new Map(all ? [] : old.map((v) => [v.videoId, v]));
const todo = ids.filter((id) => !have.has(id));

async function detail(videoId) {
  const p = await yt('player', { videoId });
  const d = p.videoDetails ?? {};
  const m = p.microformat?.playerMicroformatRenderer ?? {};
  const sec = Number(d.lengthSeconds ?? 0);
  return {
    videoId,
    title: d.title ?? '',
    publishedAt: m.publishDate ?? m.uploadDate ?? '',
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    description: d.shortDescription ?? '',
    duration: `PT${Math.floor(sec / 60)}M${sec % 60}S`,
  };
}

for (let i = 0; i < todo.length; i += 6) {
  const batch = await Promise.all(todo.slice(i, i + 6).map((id) => detail(id).catch(() => null)));
  for (const v of batch) if (v) have.set(v.videoId, v);
  process.stdout.write(`\r詳細を取得中 ${Math.min(i + 6, todo.length)}/${todo.length}`);
}
if (todo.length) process.stdout.write('\n');

const videos = ids.map((id) => have.get(id)).filter(Boolean);
videos.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
fs.writeFileSync(OUT, JSON.stringify(videos, null, 2) + '\n');
console.log(`${videos.length} 本を ${OUT} に保存しました（新規 ${todo.length} 本）`);
