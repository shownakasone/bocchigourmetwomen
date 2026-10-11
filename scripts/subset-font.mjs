// ビルド後に実行：サイトで実際に使っている文字だけを抜き出した Web フォントを作る
// - dist/ の HTML・JS に出てくる文字を集め、丸ゴシック（Zen Maru Gothic Bold）と筆記体（Yellowtail）を小さくする
// - かな・英数字・記号はいつでも使えるよう必ず入れる
// - 出来たファイル名に中身のハッシュを付け、HTML・CSS の参照を書き換える（長くキャッシュしても更新が反映される）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import subsetFont from 'subset-font';

const DIST = 'dist';
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const files = walk(DIST);
const textFiles = files.filter((f) => /\.(html|js|css)$/.test(f));

// サイトに出てくる文字
const used = new Set();
for (const f of textFiles.filter((f) => /\.(html|js)$/.test(f))) for (const c of fs.readFileSync(f, 'utf8')) used.add(c);

// いつでも入れておく文字（かな・英数字・記号）
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i));
const base = [
  ...range(0x20, 0x7e), // 英数字・記号
  ...range(0x3000, 0x303f), // 和文の句読点・かっこ
  ...range(0x3040, 0x309f), // ひらがな
  ...range(0x30a0, 0x30ff), // カタカナ
  ...range(0xff01, 0xff5e), // 全角英数字・記号
  '〜', '・', '…', '¥', '♡', '☀', '◎', '→', '←', '↑', '↓', '♪', '！', '？',
];
const zenText = [...new Set([...base, ...used])].filter((c) => c.codePointAt(0) >= 0x20).join('');
const tailText = range(0x20, 0x7e).join('');

async function make(src, text, name) {
  const buf = await subsetFont(fs.readFileSync(src), text, { targetFormat: 'woff2' });
  const hash = crypto.createHash('md5').update(buf).digest('hex').slice(0, 8);
  const out = `fonts/${name}.${hash}.woff2`;
  fs.mkdirSync(path.join(DIST, 'fonts'), { recursive: true });
  fs.writeFileSync(path.join(DIST, out), buf);
  return { placeholder: `/fonts/${name}.woff2`, url: `/${out}`, kb: Math.round(buf.length / 1024) };
}

const results = [
  await make('fonts/ZenMaruGothic-Bold.ttf', zenText, 'zenmaru-700'),
  await make('fonts/Yellowtail-Regular.ttf', tailText, 'yellowtail'),
];

// 参照を書き換え
let replaced = 0;
for (const f of textFiles.filter((f) => /\.(html|css)$/.test(f))) {
  let t = fs.readFileSync(f, 'utf8');
  const before = t;
  for (const r of results) t = t.split(r.placeholder).join(r.url);
  if (t !== before) { fs.writeFileSync(f, t); replaced++; }
}
for (const r of results) console.log(`フォント ${r.url}（${r.kb}KB）`);
console.log(`文字数 ${zenText.length}、参照を書き換えたファイル ${replaced}`);
