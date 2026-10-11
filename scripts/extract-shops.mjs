// 新しい動画の概要欄・タイトルから、Claude でお店情報を抜き出して data/shops.yaml に追加する
// - 処理済みの動画は data/processed.json に記録（同じ動画を二度処理しない）
// - すでに載っているお店への再訪なら、そのお店の visits に追加
// 使い方: ANTHROPIC_API_KEY を設定して npm run extract
import fs from 'node:fs';
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { load, dump } from 'js-yaml';

const SHOPS = 'data/shops.yaml';
const PROCESSED = 'data/processed.json';
const GENRES = ['ラーメン', '食堂・定食', 'カフェ・喫茶', '中華・町中華', 'そば・うどん', '海鮮', '洋食', '和食', 'カレー', '焼肉', 'スイーツ', 'パン', 'ご当地グルメ', 'ファミレス・チェーン', 'ファストフード', '居酒屋', 'アジア・エスニック'];

const videos = JSON.parse(fs.readFileSync('data/videos.json', 'utf8')).filter((v) => !v.sample);
const text = fs.readFileSync(SHOPS, 'utf8');
const header = text.match(/^(#.*\n|\s*\n)*/)[0];
const shops = load(text) ?? [];
const processed = new Set(fs.existsSync(PROCESSED) ? JSON.parse(fs.readFileSync(PROCESSED, 'utf8')) : []);
for (const s of shops) for (const v of s.visits ?? []) processed.add(v.videoId);

const todo = videos.filter((v) => !processed.has(v.videoId)).reverse(); // 古い順に処理
if (!todo.length) { console.log('新しい動画はありません'); process.exit(0); }
if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.log(`新しい動画 ${todo.length} 本（ANTHROPIC_API_KEY が無いのでお店の抽出はスキップ）`);
  process.exit(0);
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['shops'],
  properties: {
    shops: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['existingId', 'name', 'pref', 'city', 'genre', 'address', 'menu', 'note', 'closed'],
        properties: {
          existingId: { type: ['string', 'null'], description: '既存店リストにある同じ店なら、その id。新しい店なら null' },
          name: { type: 'string' },
          pref: { type: 'string', description: '都道府県（例: 青森県）' },
          city: { type: 'string', description: '市町村（例: 弘前市、藤崎町）。不明なら空文字' },
          genre: { type: 'string', enum: GENRES },
          address: { type: 'string', description: '概要欄に書かれた住所。無ければ空文字' },
          menu: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false, required: ['name', 'price'],
              properties: { name: { type: 'string' }, price: { type: ['integer', 'null'], description: '円。分からなければ null' } },
            },
          },
          note: { type: 'string', description: '概要欄の言葉から、そのお店の魅力を表す一文（60字以内）。無ければ空文字' },
          closed: { type: 'boolean', description: '閉店・閉店予定と書かれていれば true' },
        },
      },
    },
  },
};

const system = `あなたはYouTubeチャンネル「ぼっちグルメウーマン」（青森・岩手・秋田中心の食べ歩き）のアーカイブ編集者です。
動画のタイトルと概要欄から、実際に訪れて食事をしたお店（飲食店・市場・カフェ・パン屋など）を抜き出してください。
- ライブ配信、まとめ・ランキング動画、お祭りや観光だけ、家で作った料理、コンビニ商品の動画は shops を空配列にする
- 店名・メニュー・価格・住所は書かれている内容だけを使い、推測で補わない
- 下の「既存店」に同じお店があれば existingId にその id を入れる（支店違いは別の店）

既存店（id\t店名\t市町村）:
${shops.map((s) => `${s.id}\t${s.name}\t${s.city}`).join('\n')}`;

const client = new Anthropic();
const ids = new Set(shops.map((s) => s.id));
let added = 0, revisits = 0;

for (const v of todo) {
  const res = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `公開日: ${v.publishedAt.slice(0, 10)}\nタイトル: ${v.title}\n\n概要欄:\n${v.description}` }],
  });
  if (res.stop_reason === 'refusal') { console.warn(`スキップ（refusal）: ${v.title}`); processed.add(v.videoId); continue; }
  const block = res.content.find((b) => b.type === 'text');
  const out = JSON.parse(block?.text ?? '{"shops":[]}');

  for (const x of out.shops) {
    const visit = { videoId: v.videoId };
    const menu = x.menu.filter((m) => m.name).map((m) => (m.price ? { name: m.name, price: m.price } : { name: m.name }));
    if (menu.length) visit.menu = menu;
    if (x.note) visit.note = x.note;
    const existing = x.existingId && shops.find((s) => s.id === x.existingId);
    if (existing) {
      if (!existing.visits.some((w) => w.videoId === v.videoId)) existing.visits.unshift(visit);
      if (x.closed) existing.closed = true;
      if (!existing.address && x.address) existing.address = x.address;
      revisits++;
      continue;
    }
    let id = crypto.createHash('md5').update(x.name + '|' + x.city).digest('hex').slice(0, 8);
    while (ids.has(id)) id = crypto.createHash('md5').update(id).digest('hex').slice(0, 8);
    ids.add(id);
    const shop = { id, name: x.name, pref: x.pref, city: x.city, genre: x.genre };
    if (x.address) shop.address = x.address;
    if (x.closed) shop.closed = true;
    shop.visits = [visit];
    shops.unshift(shop);
    added++;
  }
  processed.add(v.videoId);
  console.log(`✓ ${v.title.slice(0, 40)} … ${out.shops.map((s) => s.name).join('、') || '（お店なし）'}`);
}

fs.writeFileSync(SHOPS, header + dump(shops, { lineWidth: -1, flowLevel: 4 }));
fs.writeFileSync(PROCESSED, JSON.stringify([...processed].sort(), null, 0) + '\n');
console.log(`新しいお店 ${added} 軒、再訪 ${revisits} 件を追加しました`);
