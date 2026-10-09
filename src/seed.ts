import { type Card, dayOffset } from "./model";
export function seedCards(): Card[] {
  const items: Array<Partial<Card> & { title: string; content: string }> = [
    {
      title: "ポートフォリオの OGP を設定する",
      content:
        "トップページと記事ページに OGP を追加。プレビューで画像とタイトルの表示も確認する。",
      tags: ["開発", "portfolio"],
      dueAt: dayOffset(0),
      pinned: true,
    },
    {
      title: "週末の撮影、持ち物チェック",
      content:
        "カメラ、予備バッテリー、SDカード、レンズクロス。出発前に天気と日の入り時刻も確認。",
      tags: ["写真", "持ち物"],
      dueAt: dayOffset(0),
      remindAt: dayOffset(0) + "T21:00",
      reminderEnabled: true,
      contexts: ["撮影に出かける時"],
    },
    {
      title: "気になった記事を読み返す",
      content:
        "ローカルファーストの考え方。所有している感覚は、データを持ち出せることから生まれる。",
      tags: ["開発", "読む"],
      dueAt: dayOffset(0),
    },
    {
      title: "旅行前に確認すること",
      content:
        "パスポートの有効期限、モバイルバッテリー、USB-C充電器、カメラの予備バッテリー。",
      tags: ["旅行", "持ち物"],
      dueAt: dayOffset(3),
      remindAt: dayOffset(2) + "T20:00",
      reminderEnabled: true,
      contexts: ["海外旅行の準備をする時"],
      pinned: true,
    },
    {
      title: "Xserver の更新日を確認",
      content:
        "契約の更新日と自動更新の設定を確認しておく。ついでにバックアップも。",
      tags: ["開発", "サーバー"],
      dueAt: dayOffset(5),
      remindAt: dayOffset(4) + "T20:00",
      reminderEnabled: true,
    },
    {
      title: "写真を外付け SSD にバックアップ",
      content:
        "今年の写真をコピーして、読み込みできるか確認。最低2か所に残しておく。",
      tags: ["写真", "バックアップ"],
      dueAt: dayOffset(7),
    },
    {
      title: "USB-C は、形だけでは分からない",
      content:
        "同じ形のケーブルでも、充電・データ転送・映像出力の対応が違う。買う前に仕様を見る習慣を。",
      tags: ["ガジェット", "USB-C"],
      contexts: ["PCを買うとき"],
      pinned: true,
    },
    {
      title: "逆光の飛行機は、露出を少し下げる",
      content:
        "白い機体は白飛びしやすい。露出補正を −0.3〜−0.7 にして、空の色とハイライトを残す。",
      tags: ["写真", "航空機"],
      contexts: ["飛行機を撮る時"],
      pinned: true,
    },
    {
      title: "Git の変更を一時的に置いておく",
      content:
        "作業途中に別ブランチへ移るときは git stash push -u。戻ってきたら git stash pop で再開する。",
      tags: ["開発", "Git"],
      contexts: ["作業を中断する時"],
    },
    {
      title: "iPad の 80% 充電上限",
      content:
        "普段は80%で十分。長時間の外出や旅行前は上限を解除しておくと、途中で充電を気にせずに済む。",
      tags: ["ガジェット", "iPad"],
      contexts: ["長時間外出する時"],
    },
    {
      title: "コーヒーは、少し待ってから",
      content:
        "沸騰したお湯を少し冷ましてから淹れる。温度を変えるだけでも、いつもの豆の味わいが変わる。",
      tags: ["暮らし", "コーヒー"],
    },
    {
      title: "知らない街は、朝に歩いてみる",
      content:
        "早起きして近所を一周。観光地よりも、パン屋や通学路にその街の日常が見える。",
      tags: ["旅行", "経験"],
      contexts: ["旅行先で散歩する時"],
    },
    {
      title: "アイデアは、途中でも残す",
      content:
        "完成した文章にしなくていい。未来の自分が分かるひと言があれば、続きを考えられる。",
      tags: ["Tips", "発想"],
    },
    {
      title: "次に試してみたいこと",
      content: "机の上に小さな植物を置く。いつもの散歩を少しだけ違う道にする。",
    },
    {
      title: "デプロイ前の確認リスト",
      content:
        "環境変数、リンク、モバイル表示、404ページ。公開後も実際のURLから一度確かめる。",
      tags: ["開発", "デプロイ"],
      status: "done",
      completedAt: new Date().toISOString(),
    },
  ];
  return items.map(
    (c, i) =>
      ({
        ...c,
        id: crypto.randomUUID(),
        tags: c.tags ?? [],
        contexts: c.contexts ?? [],
        status: c.status ?? "active",
        pinned: c.pinned ?? false,
        reminderEnabled: c.reminderEnabled ?? false,
        sample: true,
        createdAt: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
        updatedAt: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
      }) as Card,
  );
}
