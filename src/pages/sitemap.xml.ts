// 検索エンジン向けのページ一覧（全お店ページを含む）
import type { APIRoute } from 'astro';
import { getShops, getVideos, lastDate } from '../lib/data';

export const GET: APIRoute = ({ site }) => {
  const latest = getVideos()[0]?.publishedAt.slice(0, 10);
  const pages = [
    { loc: '/', lastmod: latest, priority: '1.0' },
    { loc: '/shops/', lastmod: latest, priority: '0.9' },
    { loc: '/videos/', lastmod: latest, priority: '0.8' },
    { loc: '/about/', priority: '0.5' },
    ...getShops().map((s) => ({ loc: `/shops/${s.id}/`, lastmod: lastDate(s).slice(0, 10), priority: '0.7' })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${new URL(p.loc, site)}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}<priority>${p.priority}</priority></url>`).join('\n')}
</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
