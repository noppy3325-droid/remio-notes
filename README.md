# Knowledge Notes

`design.md` をもとにした、ローカルファーストの Web アプリです。

## 開発

```sh
npm install
npm run dev
```

## 検証・ビルド

```sh
npm test
npm run build
npm run preview
```

React / TypeScript / Vite / Lucide / 公式 SQLite Wasm を使用。SQLite 本体のスナップショットを IndexedDB に保存し、FTS5 の trigram インデックスと文字一致・タグ・Context・簡易同義語の順位付けを組み合わせて検索します。入力の補助はルールによる候補提案で、候補はクリックするまで設定されません。

## 実装機能

- カードの追加・編集・削除・複製・アーカイブ・復元
- タグ、自然文の Context、期限、リマインダー、ピン留め
- タスク完了時の通知停止と知識の保持
- Today / Upcoming / Tasks / Knowledge / Memos / Reminders / Completed / Pinned / Random
- 4列ボードの列設定、リスト表示、並べ替え、タグ・状態・期限検索
- 日本語部分一致、FTS5、検索履歴、キーボードによる結果選択
- Ctrl/Cmd+K で検索、N で追加、Ctrl/Cmd+Enter で保存
- 関連カード、重複候補、ルールによるタグ・日時・Context提案
- JSONバックアップの書き出しと検証付きマージ読み込み
- レスポンシブ表示、フォーカストラップ、動きの軽減設定への対応
- ビルド時に生成される Service Worker によるオフライン利用
- Google OAuth（PKCE）によるログインと、Supabaseの本人専用カード同期
- アカウント別のローカル保存、永続化された送信待ち、削除の同期、編集競合の保護

## 一般公開と同期

Vercel用の設定は `vercel.json`、データベースは `supabase/migrations/202610090001_cards.sql` にあります。セットアップ手順は [DEPLOYMENT.md](./DEPLOYMENT.md) を参照してください。Supabaseの環境変数が未設定の場合はローカル利用だけが有効で、Googleログインは無効として表示します。

## Web版の範囲

ログイン前の本文は外部サーバーに送信しません。Googleログイン後のカードはSupabaseに保存され、同じアカウントの端末間で同期します。ローカルの保存領域はアカウント・サイトのorigin・ブラウザープロファイルごとに分かれます。以前のサイトからVercelへ移す場合はJSONバックアップを使用してください。未送信データは端末だけにあるため、バックアップも定期的に保存してください。

通知はアプリを開いている間に約15秒間隔でチェックします。バックグラウンドではブラウザーによって遅延する場合があります。閉じた状態での定刻通知、Tauri、ローカルLLM、EmbeddingはこのWeb版の対象外です。ブラウザー通知は設定画面で本人が許可したときだけ有効になります。サンプルカードはOS通知しません。

初回にサンプルカードを保存します。設定からサンプルだけを取り除けます。編集したサンプルは通常のカードとして残ります。オフライン利用は初回オンライン読み込みで Service Worker が準備された後に有効です。Web Locks に対応したブラウザーでは複数タブからの同時書き込みを防ぎます。

SQLite API: https://sqlite.org/wasm/doc/trunk/index.md
