// サイトの配信（dist/ の静的ファイル）に加えて、決まった時刻に GitHub の更新（daily-update）を動かす。
// GitHub の定時実行は数時間遅れたり飛ばされたりするため、時間どおりに動く Cloudflare のタイマーから呼ぶ。
// 鍵は Cloudflare の画面で「GITHUB_TOKEN」（シークレット）として登録する
const DISPATCH = 'https://api.github.com/repos/shownakasone/bocchigourmetwomen/actions/workflows/daily-update.yml/dispatches';

export default {
  async scheduled(event, env) {
    if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN が登録されていません');
    const r = await fetch(DISPATCH, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'bocchi-cron' },
      body: JSON.stringify({ ref: 'main' }),
    });
    if (!r.ok) throw new Error(`GitHub の更新を動かせませんでした: ${r.status} ${await r.text()}`);
  },
  fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
