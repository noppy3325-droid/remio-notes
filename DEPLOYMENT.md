# Vercel公開・Google同期の設定

Knowledge Notes はVercelで配信する静的Webアプリです。ログイン前のカードはブラウザー内に保存され、Googleログイン後はSupabaseで本人の端末間に同期できます。

この文書は、自分のVercel・Supabase・Google Cloudアカウントで再現するための手順です。プロジェクトID、リダイレクトURL、認証情報は環境ごとに異なります。実際の値はリポジトリへコミットしないでください。

## 必要なサービス

- Vercel: 静的サイトの配信
- Supabase: Google認証とカード同期用データベース
- Google Cloud: Google OAuth クライアント

いずれも無料枠から始められます。このリポジトリは請求先アカウントの作成、有料プランへの変更、有料アドオンの有効化を行いません。無料枠を超えた場合の挙動と料金体系は、各サービスの管理画面と公式ドキュメントで確認してください。

## 1. Supabase

1. Supabase Dashboardでプロジェクトを作成します。
2. SQL Editorで `supabase/migrations/202610090001_cards.sql` を一度実行します。
3. Project Settings / APIでProject URLとpublishable key（または旧形式のanon key）を確認します。

`service_role` / secret keyはブラウザー、Vercelの `VITE_` 変数、GitHubに入れてはいけません。SQLは行レベルセキュリティ（RLS）を有効にし、本人認証済みユーザーだけが自分のカードを読めるようにします。

## 2. Vercel

1. GitHubリポジトリをVercelプロジェクトへ接続します。
2. FrameworkをVite、Build Commandを `npm run build`、Output Directoryを `dist` に設定します。
3. Production環境のEnvironment Variablesに次を追加します。

| 名前 | 値 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key（またはanon key） |

4. 環境変数の追加後に再デプロイします。
5. Supabase Authentication / URL ConfigurationのSite URLにはVercel本番URLを、Redirect URLsには `https://<本番ドメイン>/auth/callback` を登録します。

Viteの `VITE_` 変数はビルド成果物に含まれます。ここにはURLとpublishable keyだけを置き、Client Secretなどの秘密情報は置かないでください。

## 3. Google OAuth

1. Google Cloud ConsoleでGoogle Auth Platformのアプリ情報とAudienceを設定します。
2. Google OAuth ClientをWeb applicationとして作成します。
3. Authorized JavaScript originsにVercel本番サイトのoriginを、Authorized redirect URIにSupabaseのProvider画面に表示される `https://<project-ref>.supabase.co/auth/v1/callback` を登録します。
4. Client IDとClient SecretをSupabase Authentication / Sign In / Providers / Googleに登録し、Googleプロバイダーを有効にします。
5. 要求するスコープは `openid`、`email`、`profile` だけにします。Drive、Gmailなどの権限は必要ありません。
6. 一般公開する場合はGoogleのAudience / Publishing statusをProductionに変更します。公開用のプライバシーポリシーURLも登録してください。

GoogleのClient SecretはSupabaseの設定画面にだけ保存します。GitHub、Vercelの環境変数、ブラウザーへコピーしないでください。

## 4. 動作確認

1. アプリの設定からGoogleでログインし、カードを1件追加します。
2. 同期状態が「同期済み」になることを確認します。
3. 別のブラウザーまたは端末で同じGoogleアカウントにログインし、カードが表示されることを確認します。
4. 別のGoogleアカウントでは、そのカードが表示されないことを確認します。
5. オフラインで編集してから再接続し、変更が同期されることを確認します。

`npm test` は同期の衝突、削除、通信中の編集と、PostgreSQLエンジンを使ったRLS・権限・再送安全性を検証します。

## データの扱い

- ログイン前のカードはブラウザーのSQLite / IndexedDBに保存されます。
- ログイン後のカードは端末内のコピーとSupabaseに保存されます。
- Cloudの更新は認証済みユーザー専用RPCを通じて行われます。直接のINSERT / UPDATE / DELETEは許可しません。
- 削除記録は再同期でカードが復活しないように保持します。
- ブラウザーのサイトデータを消すと、その端末の未同期編集も消えるため、必要なデータは先に同期またはJSONへ書き出してください。

公式資料: [Supabase Google認証](https://supabase.com/docs/guides/auth/social-login/auth-google)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[Vercel Vite](https://vercel.com/docs/frameworks/frontend/vite)
