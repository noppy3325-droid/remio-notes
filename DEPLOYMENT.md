# Vercel公開・Google同期の設定

アプリはVercelの静的サイト、認証とデータベースはSupabaseを使用します。アプリの入口は一般公開し、カードはGoogleアカウント本人だけが読めます。ログイン前のカードはブラウザー内だけに保存されます。

## このアプリの配置状況（2026-10-09）

- 本番URL: https://knowledge-notes-eight.vercel.app/
- GitHub: https://github.com/noppy3325-droid/knowledge-notes （非公開リポジトリ）
- Vercel: `noppy3325-1230s-projects / knowledge-notes`。GitHubの `main` を接続済み。
- Google Cloud: `Knowledge Notes` / `knowledge-notes-511113`。
- 一般公開と、カードの端末内保存・再読み込み・日本語検索を確認済み。
- Supabase: `knowledge` / `xglnmbexwsrowuosefjr` （South Asia / Mumbai）。カードDBのSQL適用、RLSと匿名アクセス拒否の確認、認証の本番戻り先設定を完了。
- VercelのProductionにSupabase URLとpublishable keyを登録し、再デプロイ済み。
- Google OAuthは設定途中。本番のGoogleログイン・クラウド同期はまだ利用できません。

SupabaseのSite URLは `https://knowledge-notes-eight.vercel.app`、アプリへのRedirect URLは `https://knowledge-notes-eight.vercel.app/auth/callback` を使用します。
Google OAuthのRedirect URIは `https://xglnmbexwsrowuosefjr.supabase.co/auth/v1/callback`、プライバシー案内は `https://knowledge-notes-eight.vercel.app/privacy.html` です。

## 1. Supabase

1. [Supabase Dashboard](https://supabase.com/dashboard)でプロジェクトを作成します。
2. SQL Editorで `supabase/migrations/202610090001_cards.sql` を一度実行します。新規プロジェクト用です。既存テーブルに上書きするSQLではありません。
3. Project Settings / APIからProject URLとpublishable keyを確認します。旧形式のanon keyも利用できます。**service_role / secret keyは使いません。**

## 2. Vercel

1. アプリのフォルダーで `npm install`、`npx vercel login`、`npx vercel --prod` を実行します。FrameworkはVite、Build Commandは `npm run build`、Output Directoryは `dist` です。`vercel.json` に設定済みです。
2. VercelのProject Settings / Environment Variablesに次をProduction環境用として登録します。

| 名前 | 値 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key（またはanon key） |

3. 変数を登録した後、再デプロイします。Viteはビルド時に変数を読み込みます。
4. Deployment Protectionは本番の一般公開を許可する設定にします。Previewを公開する必要はありません。

ローカル開発では `.env.example` を `.env.local` にコピーして同じ2つの値を設定します。キーの貼り付けは各サービスの設定画面で行い、チャットやGitに秘密鍵を送らないでください。

## 3. Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com/)でGoogle Auth Platformのアプリ情報・Audienceを設定します。必要なスコープは `openid`、`email`、`profile` だけです。
2. OAuth ClientをWeb applicationとして作成します。JavaScript originsはVercel本番サイトのorigin、Authorized redirect URIはSupabaseのGoogle Provider画面に表示される `https://<project-ref>.supabase.co/auth/v1/callback` です。
3. Client IDとClient SecretはSupabase Authentication / Sign In / Providers / Googleに登録し、Googleを有効にします。Client SecretはVercelの `VITE_` 変数には入れません。
4. Supabase Authentication / URL ConfigurationのSite URLをVercel本番URLにします。Redirect URLsに `https://<本番ドメイン>/auth/callback` を追加します。開発用は `http://localhost:5173/auth/callback` または実際の開発originを追加します。
5. 広く一般公開する場合はGoogleのAudience / Publishing statusをProductionにします。Testing中は登録したテストユーザーだけを使用します。

Google→Supabaseのcallbackと、Supabase→アプリの `/auth/callback` は別のURLです。

## 4. 動作確認

1. アプリの設定からGoogleでログインし、カードを追加します。初回のアカウントは空です。設定の同期表示が「同期済み」になるまで待ちます。
2. 別のブラウザーまたは端末で同じGoogleアカウントにログインし、カードを確認します。20秒ごとの同期と「今すぐ同期」があります。
3. 別のGoogleアカウントではそのカードが表示されないことを確認します。
4. オフラインで編集→再接続して変更が反映されることを確認します。
5. 同じカードを複数端末で同時編集した場合は、片方の内容が「競合した編集」として保存されることを確認します。削除も他端末へ反映されます。

`npm test` は同期の衝突・削除・通信中の編集と、PostgreSQLエンジンを使ったSQL/RLSの分離・権限・再送安全性を検証します。本物のGoogle OAuthとSupabaseの接続確認は上記設定後に行う必要があります。

## 既存カードの移行

以前のchatgpt.siteとVercelは別originです。以前のサイトの設定でJSONを書き出し、Vercel版にGoogleログインしてJSONを読み込むと、そのアカウントに同期できます。同じoriginのログイン前のカードは、設定の「この端末のカードを同期へ取り込む」でコピーできます。サンプルは取り込みません。

## 保存と運用

- SQLiteのアカウント別スナップショットにカードと送信待ちデータを一緒に保存します。ログアウトしても未送信編集はそのアカウントの端末内コピーに残り、再ログイン後に送信します。
- Cloudの更新は本人認証必須のRPCだけで行います。DBのRLSが読取を本人に限定し、直接のINSERT/UPDATE/DELETEは許可しません。削除はtombstoneを保持し、古い端末からの復活を防ぎます。
- 同期は全件スナップショット方式です。個人のノート用途を想定しています。大規模な利用ではページング・差分配信・バックアップ・監視・料金上限の運用を追加してください。
- Googleログインは認証のみに利用し、Drive/Gmail等の権限は要求しません。アプリのカードはSupabaseに保存します。
- サーバー側のDBはSQL制約とアクセス制御で保護しますが、本文のエンドツーエンド暗号化はありません。
- ブラウザーのサイトデータを削除すると、その端末の未送信編集も消えます。共有端末ではログアウト後にサイトデータを削除してください。
- 通知はアプリを開いている間だけ動きます。閉じた状態での定刻通知は含みません。

公式資料: [Supabase Google認証](https://supabase.com/docs/guides/auth/social-login/auth-google)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[Vercel Vite](https://vercel.com/docs/frameworks/frontend/vite)。
