# Android版

Web版と同じReact / SQLite / SupabaseコードをCapacitor 8でAndroidアプリとして配布します。画面・SQLite Wasm・アイコンをAPKに同梱しているため、初回起動からローカルの閲覧・記録ができます。Android 7.0以降と対応するAndroid System WebViewが必要です。

## APKを使う

[GitHub Releases](https://github.com/noppy3325-droid/remio-notes/releases)から署名付きAPKをダウンロードしてください。Google Playでの配布は行いません。アプリの保存領域はWebブラウザーと別です。同じGoogleアカウントでログインして同期するか、JSONバックアップを取り込んでください。

- 戻るボタン：開いている画面を閉じ、ホームで押すとアプリを最小化
- バックアップ：Androidの共有画面からJSONを保存・共有。読み込みはファイル選択
- リマインダー：設定から通知を許可すると、閉じている間も端末に通知（省電力設定による遅延あり）。今後の通知は最大60件
- Googleログイン：端末ブラウザーで認証し、PKCEでコードを検証してアプリへ復帰

## 開発環境

Node.js 22以降、JDK 21、Android SDK Platform 36、Android Build Tools、ADBを用意してください。`JAVA_HOME`と`ANDROID_HOME`を設定するか、SDKの場所を`android/local.properties`に指定します。

```sh
npm ci
npm run android:debug
```

ビルドスクリプトはWindows・macOS・Linuxに対応します。`npm run android:sync`でWebの変更とネイティブプラグインを反映できます。Android Studioでは`android/`を開きます。

## Google同期の設定

[DEPLOYMENT.md](./DEPLOYMENT.md)の設定に加え、次を行います。

1. `.env.android.local`に`VITE_SUPABASE_URL`と`VITE_SUPABASE_PUBLISHABLE_KEY`を設定
2. Supabase Authentication → URL Configuration → Redirect URLsに`remionotes://auth/callback`を追加
3. `npm run android:sync`で再ビルド

Client Secret、service role key、アクセストークンをAPKやソースに含めないでください。publishable keyは公開用です。認証コードはアプリ内に保持したPKCE検証情報と照合します。

## 署名とリリース

```sh
npm run android:key
npm run android:release
```

初回だけ`android:key`を実行します。`.private/`内のキーストアと署名設定はGitの対象外です。将来の更新でも同じ鍵が必要なので、両方を安全な場所へバックアップしてください。出力は`android/app/build/outputs/apk/release/app-release.apk`です。バージョンは`android/app/build.gradle`の`versionCode` / `versionName`で更新します。秘密鍵・パスワード・`local.properties`を公開しないでください。

## ADBで検証

```sh
npm test
npm run android:sync
cd android
gradlew assembleRelease assembleReleaseAndroidTest
adb install -r app/build/outputs/apk/release/app-release.apk
adb install -r app/build/outputs/apk/androidTest/release/app-release-androidTest.apk
adb shell am instrument -w -e class app.remionotes.android.MobileFlowTest#createSearchRestartAndBack app.remionotes.android.test/androidx.test.runner.AndroidJUnitRunner
```

実機テストはカード追加、端末内保存、Activity再作成後の復元、検索、戻る操作、生成したテストカードの削除を確認します。テスト中はWebView内のネットワークだけを遮断し、スマートフォンの通信設定は変更しません。Googleログインと同期は別途、オンラインの実機で確認してください。

Googleログインを端末で済ませた後は、同じコマンドのメソッド名を`authenticatedSyncAndBackup`に変更すると、ログイン済み表示、同期完了、JSON書き出しと共有用ファイルの読み取りを検証できます。このテストは共有画面へのIntentを捕捉し、外部への送信は行いません。

macOS・Linuxでは`gradlew`を`./gradlew`に読み替えてください。

Android版でも新しい有料APIは追加しません。同期先のプラン・上限はWeb版と共通です。
