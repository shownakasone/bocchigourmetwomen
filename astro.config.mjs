import { defineConfig } from 'astro/config';
// 公開URL。独自ドメインにしたらここを書き換える（サイトマップ・検索エンジン向け情報に使われる）
export default defineConfig({
  site: 'https://bocchigourmetwomen.aomori.workers.dev',
  // リンクに触れた瞬間（指が画面に触れた・マウスを押した時点）に次のページを先読みする
  prefetch: { prefetchAll: true, defaultStrategy: 'tap' },
});
