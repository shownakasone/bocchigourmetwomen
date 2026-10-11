import fs from 'node:fs';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';

export interface Video {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnail: string;
  description: string;
  duration: string;
  sample?: boolean;
}

export interface MenuItem { name: string; price?: number }
export interface Visit { videoId: string; menu?: MenuItem[]; note?: string; timestamp?: number }

export interface Shop {
  id: string;
  name: string;
  pref: string;
  city: string;
  genre: string;
  address?: string;
  lat?: number;
  lng?: number;
  approx?: boolean;
  solo?: 1 | 2 | 3;
  closed?: boolean;
  draft?: boolean;
  sample?: boolean;
  visits: Visit[];
}

export type Budget = '~500' | '~1000' | '~1500' | '1500~';
export const BUDGET_LABEL: Record<Budget, string> = {
  '~500': 'ワンコイン',
  '~1000': '〜1,000円',
  '~1500': '〜1,500円',
  '1500~': '1,500円〜',
};
export const SOLO_LABEL = { 1: 'ひとりは少し勇気', 2: 'ひとりでも大丈夫', 3: 'ひとり歓迎' } as const;

const root = process.cwd();
const videos: Video[] = JSON.parse(fs.readFileSync(path.join(root, 'data/videos.json'), 'utf8'));
videos.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
const videoMap = new Map(videos.map((v) => [v.videoId, v]));

const shops: Shop[] = ((loadYaml(fs.readFileSync(path.join(root, 'data/shops.yaml'), 'utf8')) as Shop[]) ?? [])
  .filter((s) => !s.draft)
  .map((s) => ({
    ...s,
    visits: [...(s.visits ?? [])]
      .filter((v) => videoMap.has(v.videoId))
      .sort((a, b) => videoMap.get(b.videoId)!.publishedAt.localeCompare(videoMap.get(a.videoId)!.publishedAt)),
  }))
  .filter((s) => s.visits.length > 0);

// 最近行った順
shops.sort((a, b) => lastDate(b).localeCompare(lastDate(a)));

const byVideo = new Map<string, Shop[]>();
for (const s of shops) for (const v of s.visits) byVideo.set(v.videoId, [...(byVideo.get(v.videoId) ?? []), s]);

export const getVideos = () => videos;
export const getShops = () => shops;
export const getVideo = (id: string) => videoMap.get(id);
export const shopsOfVideo = (id: string) => byVideo.get(id) ?? [];

export function lastDate(s: Shop) {
  return videoMap.get(s.visits[0]?.videoId)?.publishedAt ?? '';
}
export const latestVideo = (s: Shop) => videoMap.get(s.visits[0].videoId)!;

// 1回の訪問で払った金額のうち、いちばん多かったもの（価格が分かる場合のみ）
export function spend(s: Shop): number | undefined {
  const totals = s.visits.map((v) => (v.menu ?? []).reduce((a, m) => a + (m.price ?? 0), 0)).filter((n) => n > 0);
  return totals.length ? Math.max(...totals) : undefined;
}
export function budgetOf(s: Shop): Budget | undefined {
  const n = spend(s);
  if (n == null) return undefined;
  return n <= 500 ? '~500' : n <= 1000 ? '~1000' : n <= 1500 ? '~1500' : '1500~';
}

const MORNING = /朝ラー|朝ごはん|朝ご飯|朝食|朝定食|モーニング|朝寿司|朝活|朝[0-9０-９]時|朝営業/;
export function isMorning(s: Shop) {
  return s.visits.some((v) => {
    const t = [videoMap.get(v.videoId)?.title ?? '', v.note ?? '', ...(v.menu ?? []).map((m) => m.name)].join(' ');
    return MORNING.test(t);
  });
}

// mqdefault は 16:9 で黒帯がない。大きく見せたいときは maxres（無い動画は hq にフォールバック）
export const thumb = (v?: Video) => (v && !v.sample ? `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg` : '');
export const thumbLarge = (v?: Video) => (v && !v.sample ? `https://i.ytimg.com/vi/${v.videoId}/maxresdefault.jpg` : '');

export const watchUrl = (videoId: string, t = 0) =>
  `https://www.youtube.com/watch?v=${videoId}${t ? `&t=${t}s` : ''}`;

export const mapsUrl = (s: Shop) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name.replace(/[（(].*?[）)]/g, '')} ${s.address ?? s.pref + s.city}`)}`;

export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

export const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`;

export const uniq = <T,>(xs: T[]) => [...new Set(xs)];

export const countBy = <T,>(xs: T[], f: (x: T) => string) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(f(x), (m.get(f(x)) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
};

export const PREF_ORDER = ['青森県', '岩手県', '秋田県', '北海道', '宮城県', '福島県'];

export const CHANNEL_URL = 'https://www.youtube.com/@bocchi-g-women';
// Instagram のURLを入れるとフッター・Aboutにリンクが出ます
export const INSTAGRAM_URL = 'https://www.instagram.com/bocchigurumeuman/';

export const GENRE_EN: Record<string, string> = {
  'ラーメン': 'Ramen', '食堂・定食': 'Shokudo', 'カフェ・喫茶': 'Cafe', '中華・町中華': 'Chinese', 'そば・うどん': 'Soba & Udon',
  '海鮮': 'Seafood', '洋食': 'Yoshoku', '和食': 'Japanese', 'カレー': 'Curry', '焼肉': 'Yakiniku', 'スイーツ': 'Sweets', 'パン': 'Bakery',
  'ご当地グルメ': 'Local Food', 'ファミレス・チェーン': 'Family Dining', 'ファストフード': 'Fast Food', '居酒屋': 'Izakaya', 'アジア・エスニック': 'Ethnic',
};

// 動画の長さ（例 PT9M25S）を「9:25」に
export const fmtDuration = (iso?: string) => {
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '';
  const [h, mi, s] = [Number(m[1] ?? 0), Number(m[2] ?? 0), Number(m[3] ?? 0)];
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(mi)}:${pad(s)}` : `${mi}:${pad(s)}`;
};
// 公開から n 日以内か（ビルド時点で判定。サイトは毎日作り直される）
export const isRecent = (iso: string, days = 7) => Date.now() - new Date(iso).getTime() < days * 864e5;
