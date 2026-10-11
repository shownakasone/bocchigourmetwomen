// 「さがす」のキーワード検索用の文章（店名・まち・ジャンル・住所・動画タイトル・メモ・メニュー）
// 検索欄に触れたときに初めて読み込む（最初の表示を軽くするため）
import type { APIRoute } from 'astro';
import { getShops, getVideo } from '../lib/data';

export const GET: APIRoute = () => {
  const index = Object.fromEntries(getShops().map((s) => [s.id,
    [s.name, s.pref, s.city, s.genre, s.address ?? '', ...s.visits.flatMap((v) => [getVideo(v.videoId)?.title ?? '', v.note ?? '', ...(v.menu ?? []).map((m) => m.name)])].join(' ').toLowerCase(),
  ]));
  return new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
