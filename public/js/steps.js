// Definitions of the training steps 2〜8 (工程2〜8).
// Step 1 is the original 3C analysis (room.html / analyze.html).
//
// Each step declares:
//   - columns : sticky-note columns shown to participants (same UI as the 3C board)
//   - inputs  : which earlier steps feed this one (shown as "前工程からの入力")
//   - buildPrompt(ctx) : the prompt copied to claude.ai / ChatGPT (or sent via API)
//   - decision : label of the value the facilitator fixes at the end of the step
//
// ctx passed to buildPrompt / helpers:
//   ctx.room            room record
//   ctx.notes3c         array of 3C notes  { category, sub, text, authorName }
//   ctx.stepNotes(step) array of step notes { category, sub, text, authorName }
//   ctx.data(step, key) saved string for (step, key) or ""
//   ctx.prior(step)     decision if set, otherwise result, otherwise ""

import { CATEGORIES, formatDate } from "./common.js";

export const TOTAL_STEPS = 8;

// Column palettes (index → CSS class, see style.css "Step boards")
export const COLUMN_COLORS = ["col-a", "col-b", "col-c", "col-d", "col-e"];

export const STEP1 = {
  id: 1,
  title: "AI活用3C分析→バリュープロポジション創出",
  short: "3C分析",
  icon: "🎯",
  decision: { label: "未来バリュープロポジション（決定）", placeholder: "AIの3案から選んだ／磨いたバリュープロポジションを貼り付け" }
};

// ---------- formatting helpers ----------
const fmtList = arr => arr.length ? arr.map(t => `- ${t}`).join("\n") : "- （データなし）";

function groupBySub(notes) {
  const bySub = new Map();
  for (const n of notes) {
    if (!bySub.has(n.sub)) bySub.set(n.sub, []);
    bySub.get(n.sub).push(n.text);
  }
  if (bySub.size === 0) return "（データなし）";
  return [...bySub.entries()].map(([sub, texts]) =>
    `### ${sub}\n` + fmtList(texts)
  ).join("\n\n");
}

/** 3C notes of one category, grouped by sub-theme. */
export function notes3cSection(ctx, category) {
  return groupBySub(ctx.notes3c.filter(n => n.category === category));
}

/** Step notes grouped by column and sub-theme. */
export function stepNotesSection(ctx, step) {
  const def = getStep(step);
  const notes = ctx.stepNotes(step);
  if (!notes.length) return "（付箋なし）";
  return def.columns.map(col => {
    const list = notes.filter(n => n.category === col.key);
    if (!list.length) return null;
    return `## ${col.label}\n${groupBySub(list)}`;
  }).filter(Boolean).join("\n\n");
}

function priorBlock(ctx, step, label) {
  const v = ctx.prior(step);
  return `## ${label}（工程${step}の結果）\n${v ? v : "（未入力。工程" + step + "の結果を先に保存してください）"}`;
}

function sessionBlock(ctx, step) {
  const r = ctx.room || {};
  const dateStr = r.scheduledAt ? formatDate(r.scheduledAt) : "";
  return `# セッション情報
- セッション名: ${r.title || "（無題のセッション）"}${r.hostName ? `\n- 主催者: ${r.hostName}` : ""}${dateStr ? `\n- 開催日時: ${dateStr}` : ""}
- 工程: ${step}. ${getStep(step).title}`;
}

const INTRO = "あなたは経営戦略・ブランドマーケティングのトップコンサルタントです。中小企業の経営者チームと進めている「攻めのDX・AI活用ブランドマーケティング戦略構築講座」のワークショップで、参加者が出した付箋と前工程の結果をもとに、次の成果物を作ってください。日本語で、優秀なマーケターらしい鋭い洞察を含めて、Markdown で書いてください。";

// ---------- step definitions ----------
export const STEPS = [
  {
    id: 2,
    title: "市場細分化／見込み客の再考",
    short: "市場細分化",
    icon: "🧩",
    goal: "3Cの顧客付箋から市場をセグメントに分け、AIでスコアリングして優先ターゲットを決めます。",
    participantGuide: "「どんな人たちのかたまりがいるか」を思いつくまま付箋に。今のお客様も、来てほしいお客様も。",
    columns: [
      { key: "segment", label: "セグメント案",
        subs: ["属性で分ける", "困りごとで分ける", "利用シーンで分ける", "買い方で分ける"] },
      { key: "prospect", label: "見込み客のヒント",
        subs: ["今のお客様", "来てほしいお客様", "来なくていいお客様"] }
    ],
    inputs: [{ step: 1, label: "バリュープロポジション" }, { notes3c: "customer", label: "3C: 顧客の付箋" }],
    decision: { label: "優先ターゲット（決定）", placeholder: "例: 保証切れ後の頼み先を失った築10〜20年の戸建てオーナー" },
    buildPrompt(ctx) {
      return `${INTRO}

${sessionBlock(ctx, 2)}

${priorBlock(ctx, 1, "バリュープロポジション")}

# 3C分析で集めた「顧客」の付箋
${notes3cSection(ctx, "customer")}

# この工程で参加者が出した付箋
${stepNotesSection(ctx, 2)}

---

# 依頼
1. 上のデータから、意味のある**顧客セグメント**を 5〜7 個に整理してください（重なりが少なく、行動や困りごとで区別できる切り方で）。
2. 各セグメントを次の 5 軸で 1〜5 点で採点し、合計点つきの **Markdown の表** にしてください。
   - 市場規模 / バリュープロポジションとの適合 / 競合の少なさ / 自社が届きやすいか / 今後の成長性
3. 合計点と定性判断を合わせて、**優先ターゲット**を主 1 つ・副 1 つ選び、理由を書いてください。
4. 「見込み客の再定義」として、今まで見落としていた可能性のある層を 3 行で指摘してください。

# 出力フォーマット
## セグメント一覧
（番号・名前・どんな人か・代表的な困りごと）
## スコアリング表
（Markdown表）
## 優先ターゲット
- **主ターゲット**: …（理由）
- **副ターゲット**: …（理由）
## 見込み客の再定義
…`;
    }
  },

  {
    id: 3,
    title: "AIベースペルソナの再考",
    short: "ペルソナ",
    icon: "🧑‍💼",
    goal: "優先ターゲットをもとに、行動・感情・購買傾向まで具体化したペルソナをAIで生成します。",
    participantGuide: "優先ターゲットに近い「実際のお客様」を思い出して、口ぐせ・きっかけ・行動・不安を付箋に。",
    columns: [
      { key: "material", label: "ペルソナの材料",
        subs: ["よく聞く言葉・口ぐせ", "来店・購入のきっかけ", "普段の行動・情報源", "不安・ためらい"] }
    ],
    inputs: [{ step: 2, label: "優先ターゲット" }, { step: 1, label: "バリュープロポジション" }, { notes3c: "customer", label: "3C: 顧客の付箋" }],
    decision: { label: "採用ペルソナ（要約）", placeholder: "例: 田中さん 45歳・共働き・築15年の戸建て。壊れてから慌てて探すのが嫌…" },
    buildPrompt(ctx) {
      return `${INTRO}

${sessionBlock(ctx, 3)}

${priorBlock(ctx, 2, "優先ターゲット")}

${priorBlock(ctx, 1, "バリュープロポジション")}

# 3C分析で集めた「顧客」の付箋
${notes3cSection(ctx, "customer")}

# この工程で参加者が出した付箋（実際のお客様のエピソード）
${stepNotesSection(ctx, 3)}

---

# 依頼
優先ターゲットを代表する **メインペルソナ 1 人** を、付箋の生の言葉を活かして具体的に描いてください。架空でも構いませんが、付箋にある事実と矛盾しないこと。

# 出力フォーマット
## ペルソナ: 〔名前〕
- **基本情報**: 年齢 / 職業 / 家族 / 住まい / 年収感 / よく使うデバイス・SNS
- **ある1日の行動**: 朝〜夜の流れを 5〜7 行で
- **価値観・口ぐせ**: 3つ
## 行動特性
- 情報収集の仕方 / 相談する相手 / 比較する軸 / 決めるまでの期間
## 感情の動き
| 段階 | 気持ち | 不安・ためらい | 背中を押すもの |
| 認知 / 興味 / 比較 / 購入 / 利用後 の 5 行 |
## 購買傾向
- 決め手 / 価格感度 / 誰が決裁するか / 買った後に期待すること
## このペルソナが自社に求めていること（一言）
…
## ペルソナ要約（3行）
（次の工程で使う要約）
## サブペルソナ（任意・5行以内）
…`;
    }
  },

  {
    id: 4,
    title: "ポジショニングの再考",
    short: "ポジショニング",
    icon: "🗺️",
    goal: "競合の付箋と口コミ・SNSの声から2軸マップを作り、空いているポジションを見つけます。",
    participantGuide: "競合ごとに「強み・弱み・価格帯・雰囲気」を付箋に（頭に競合名を書く）。口コミやSNSで見かけた声もそのまま。",
    columns: [
      { key: "competitor", label: "競合の特徴",
        subs: ["強み・売り", "弱み・不満", "価格帯", "見た目・雰囲気"] },
      { key: "voice", label: "口コミ・SNSの声",
        subs: ["自社への口コミ", "競合への口コミ", "SNSで話題のこと", "選ばれる理由／選ばれない理由"] }
    ],
    inputs: [{ step: 1, label: "バリュープロポジション" }, { step: 3, label: "ペルソナ" }, { notes3c: "competitor", label: "3C: 競合の付箋" }, { notes3c: "company", label: "3C: 自社の付箋" }],
    decision: { label: "ポジショニング（決定）", placeholder: "例: 〔ペルソナ〕にとって、自社は〔軸A〕×〔軸B〕の空白を埋める唯一の〜" },
    buildPrompt(ctx) {
      return `${INTRO}

${sessionBlock(ctx, 4)}

${priorBlock(ctx, 1, "バリュープロポジション")}

${priorBlock(ctx, 3, "ペルソナ")}

# 3C分析で集めた「競合」の付箋
${notes3cSection(ctx, "competitor")}

# 3C分析で集めた「自社」の付箋
${notes3cSection(ctx, "company")}

# この工程で参加者が出した付箋（競合の特徴・口コミ/SNSの声）
${stepNotesSection(ctx, 4)}

---

# 依頼
1. ペルソナが選ぶときに本当に気にしている軸を踏まえ、**ポジショニングマップの2軸の候補を 3 組** 提案してください（各軸は両端の言葉で定義。例: 「壊れてから対応 ↔ 壊れる前から関わる」）。
2. 最も差別化が見えやすい 1 組を選び、自社と主な競合を **-5〜+5 の座標で配置した表** にしてください（根拠は付箋・口コミの言葉を引用）。
3. マップ上の**空きポジション**を 2〜3 個挙げ、それぞれ「ペルソナが求めているか」「バリュープロポジションと合うか」「自社の資源で取れるか」を◎○△で評価してください。
4. 最終的なポジショニングを次の型の**一文**で書いてください: 「〔ペルソナ〕にとって、〔自社〕は〔カテゴリ〕の中で唯一〔独自価値〕を提供する存在である。なぜなら〔根拠〕。」
5. このポジションを取るときのリスクと打ち手を 3 つ。

# 出力フォーマット
## 2軸の候補（3組）
## 採用する2軸とマップ
（Markdown表: 名前 / 横軸座標 / 縦軸座標 / 根拠）
## 空きポジションの評価
## ポジショニング・ステートメント
## リスクと打ち手`;
    }
  },

  {
    id: 5,
    title: "ブランドコンセプト立案",
    short: "コンセプト",
    icon: "💡",
    goal: "バリュープロポジションとペルソナから、キャッチコピー案とブランドストーリー案をAIで出し、トーナメントで決めます。",
    participantGuide: "全員が「会社を一言で表す」案を書く。お客様に言われて嬉しかった言葉や、自分たちのこだわりも付箋に。",
    columns: [
      { key: "concept", label: "コンセプトの素材",
        subs: ["キャッチコピー案", "大事にしたい言葉", "お客様に言われて嬉しかった言葉", "らしさ・こだわり"] }
    ],
    inputs: [{ step: 1, label: "バリュープロポジション" }, { step: 3, label: "ペルソナ" }, { step: 4, label: "ポジショニング" }],
    decision: { label: "ブランドコンセプト（決定）", placeholder: "例: 一家にひとり、いつもの相棒" },
    buildPrompt(ctx) {
      return `${INTRO}

${sessionBlock(ctx, 5)}

${priorBlock(ctx, 1, "バリュープロポジション")}

${priorBlock(ctx, 3, "ペルソナ")}

${priorBlock(ctx, 4, "ポジショニング")}

# この工程で参加者が出した付箋
${stepNotesSection(ctx, 5)}

---

# 依頼
ブランドコンセプト＝「自分たちが提供したい価値を一言にしたもの」です。ブランドイメージ（お客様から見えている姿）と混同しないでください。

1. 参加者のキャッチコピー案を活かしつつ、**キャッチコピー候補を 8 案**（機能的価値型 / 情緒的価値型 / 宣言型 / お客様の言葉型 をまぜて）。各案に「狙い」と「ペルソナがどう感じるか」を 1 行ずつ。
2. **コンセプト文（1〜2文）を 3 案**。
3. **ブランドストーリー案を 2 本**（各 300 字程度。お客様の困りごと → 自社の想い → 約束、の流れ）。
4. 参加者がトーナメントで決められるように、8 案の**1回戦の組み合わせ**と、比べるときの**判断基準 3 つ**を提示してください。

# 出力フォーマット
## キャッチコピー候補（8案）
| No. | 案 | タイプ | 狙い | ペルソナの感じ方 |
## コンセプト文（3案）
## ブランドストーリー案（2本）
## トーナメント表と判断基準`;
    }
  },

  {
    id: 6,
    title: "クリエイティブ要素立案",
    short: "クリエイティブ",
    icon: "🎨",
    goal: "決まったコンセプトから、メインカラーとタグライン案をAIで試作し、評価します。",
    participantGuide: "コンセプトから浮かぶ色・雰囲気・参考にしたいブランド・避けたい表現を付箋に。",
    columns: [
      { key: "image", label: "イメージの材料",
        subs: ["色のイメージ", "雰囲気・トーン", "参考にしたいブランド", "避けたい表現"] }
    ],
    inputs: [{ step: 5, label: "ブランドコンセプト" }, { step: 3, label: "ペルソナ" }, { step: 4, label: "ポジショニング" }],
    decision: { label: "採用カラー／タグライン（決定）", placeholder: "例: メイン #1F6F5F（深い緑）／タグライン「壊れる前から、そばにいる。」" },
    buildPrompt(ctx) {
      return `${INTRO}

${sessionBlock(ctx, 6)}

${priorBlock(ctx, 5, "ブランドコンセプト")}

${priorBlock(ctx, 3, "ペルソナ")}

${priorBlock(ctx, 4, "ポジショニング")}

# この工程で参加者が出した付箋
${stepNotesSection(ctx, 6)}

---

# 依頼
1. **カラーパレット案を 3 つ**。各案に メインカラー / サブカラー / アクセントカラー の HEX コード（#RRGGBB 形式で必ず書く）、色の意味、ペルソナへの印象、使いどころ（看板・Web・ユニフォームなど）。
2. **タグライン案を 6 つ**（コンセプトを日常語に落とした短い一文。10〜20字）。
3. **トーン＆マナー**: 使う言葉 / 使わない言葉 / 写真・イラストの方向性 / 書体の方向性。
4. **評価表**: カラー案3つとタグライン6つを「ペルソナ適合 / 競合との差別化 / コンセプトとの一貫性 / 使いやすさ」で 1〜5 点評価し、推奨を 1 つずつ選んで理由を書く。

# 出力フォーマット
## カラーパレット案（3案）
（案ごとに見出し。HEX は #RRGGBB 形式）
## タグライン案（6案）
## トーン＆マナー
## 評価表と推奨
（Markdown表 → 推奨カラー案 / 推奨タグライン / 理由）`;
    }
  },

  {
    id: 7,
    title: "マーケティングファネル設計",
    short: "ファネル",
    icon: "🔻",
    goal: "認知〜購買〜紹介の各段階で、どの媒体で何を伝えるかを付箋で出し、表にまとめます。",
    participantGuide: "段階ごとに「媒体（どこで）」と「内容（何を）」を分けて付箋に。今やっていることも、やってみたいことも。",
    columns: [
      { key: "aware",    label: "認知",        subs: ["媒体", "内容"] },
      { key: "interest", label: "興味・関心",  subs: ["媒体", "内容"] },
      { key: "compare",  label: "比較・検討",  subs: ["媒体", "内容"] },
      { key: "buy",      label: "購買",        subs: ["媒体", "内容"] },
      { key: "refer",    label: "継続・紹介",  subs: ["媒体", "内容"] }
    ],
    inputs: [{ step: 3, label: "ペルソナ" }, { step: 5, label: "ブランドコンセプト" }, { step: 6, label: "クリエイティブ要素" }, { step: 4, label: "ポジショニング" }],
    decision: { label: "ファネル設計（決定メモ）", placeholder: "例: 認知=Instagram＋地域紙、比較=LINE相談、購買=点検無料、紹介=年1回の家の健康診断…" },
    buildPrompt(ctx) {
      return `${INTRO}

${sessionBlock(ctx, 7)}

${priorBlock(ctx, 3, "ペルソナ")}

${priorBlock(ctx, 5, "ブランドコンセプト")}

${priorBlock(ctx, 6, "クリエイティブ要素")}

${priorBlock(ctx, 4, "ポジショニング")}

# この工程で参加者が出した付箋（段階ごとの媒体・内容）
${stepNotesSection(ctx, 7)}

---

# 依頼
ペルソナが「認知 → 興味・関心 → 比較・検討 → 購買 → 継続・紹介」と進むマーケティングファネルを設計してください。参加者の付箋にある媒体・内容を活かし、足りない部分を補ってください。

1. **ファネル表**（Markdown表。行 = 5 段階）: 段階 / この段階のペルソナの心理 / 媒体（参加者案＋補完） / 内容・メッセージ / 次の段階へ進ませる仕掛け / KPI
2. 各段階の内容がブランドコンセプト・トーン＆マナーと矛盾していないかのチェック（気になる点を 3 つまで）。
3. 最も効果が出やすい**強化ポイント 3 つ**（理由と最初の一手）。

# 出力フォーマット
## ファネル表
## コンセプトとの整合チェック
## 強化ポイント（3つ）`;
    }
  },

  {
    id: 8,
    title: "アクションプランの検討",
    short: "アクション",
    icon: "🚀",
    goal: "工程1〜7を統合し、担当・期限・優先度つきの施策一覧に落とします。",
    participantGuide: "「すぐやる／次にやる／じっくり」で施策アイデアを付箋に。誰ができそうか、外に頼むこと、やめることも。",
    columns: [
      { key: "action", label: "施策アイデア",
        subs: ["すぐやる（〜3ヶ月）", "次にやる（〜6ヶ月）", "じっくり（〜1年）"] },
      { key: "team", label: "担当・体制",
        subs: ["できる人・やりたい人", "外部に頼むこと", "やめること"] }
    ],
    inputs: [
      { step: 1, label: "バリュープロポジション" }, { step: 2, label: "優先ターゲット" },
      { step: 3, label: "ペルソナ" }, { step: 4, label: "ポジショニング" },
      { step: 5, label: "ブランドコンセプト" }, { step: 6, label: "クリエイティブ要素" },
      { step: 7, label: "ファネル設計" }
    ],
    decision: { label: "アクションプラン（決定）", placeholder: "決まった施策一覧（担当・期限・優先度）を貼り付け" },
    buildPrompt(ctx) {
      const blocks = [1, 2, 3, 4, 5, 6, 7].map(s => priorBlock(ctx, s, [
        "", "バリュープロポジション", "優先ターゲット", "ペルソナ", "ポジショニング", "ブランドコンセプト", "クリエイティブ要素", "ファネル設計"
      ][s])).join("\n\n");
      return `${INTRO}

${sessionBlock(ctx, 8)}

${blocks}

# この工程で参加者が出した付箋（施策アイデア・担当・体制）
${stepNotesSection(ctx, 8)}

---

# 依頼
工程1〜7の結果を統合し、実行できる**アクションプラン**にしてください。参加者の施策アイデアを必ず拾い、足りない施策を補ってください。

1. **施策一覧**（Markdown表、10〜15 行）: No. / 施策 / 目的（どの工程・ファネル段階に効くか） / 担当（付箋の「できる人」を参考に。不明なら役割名） / 期限（今日から 3ヶ月・6ヶ月・1年 のどれか＋目安月） / 優先度（高・中・低） / KPI / 最初の一歩
2. **90日ロードマップ**: 週次〜月次で何を終わらせるか。
3. **やめること・外部に頼むこと**の整理。
4. **リスクと対策** 3 つ。

# 出力フォーマット
## 施策一覧
## 90日ロードマップ
## やめること・外部に頼むこと
## リスクと対策`;
    }
  }
];

export function getStep(id) {
  const n = Number(id);
  if (n === 1) return STEP1;
  return STEPS.find(s => s.id === n) || null;
}

export function stepUrl(code, step, forParticipant = false) {
  const n = Number(step);
  if (forParticipant) return n <= 1 ? `/room.html?code=${code}` : `/board.html?code=${code}&step=${n}`;
  return n <= 1 ? `/analyze.html?code=${code}` : `/step.html?code=${code}&step=${n}`;
}

/** Build the ctx object used by buildPrompt. */
export function makeCtx({ room, notes3c, stepNotesAll, dataMap }) {
  const data = (step, key) => {
    const d = dataMap[`${step}:${key}`];
    return d ? d.content : "";
  };
  return {
    room,
    notes3c: notes3c || [],
    stepNotes: step => (stepNotesAll || []).filter(n => n.step === Number(step)),
    data,
    prior: step => (data(step, "decision") || data(step, "result") || "").trim()
  };
}

// Column color class for a step's column index.
export function columnColor(idx) {
  return COLUMN_COLORS[idx % COLUMN_COLORS.length];
}

// Re-export for pages that need the 3C categories alongside.
export { CATEGORIES };
