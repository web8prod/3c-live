// Browser-direct Claude API client.
// IMPORTANT: This sends the API key directly from the user's browser to
// api.anthropic.com. The key never touches our backend (we don't have one).

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export const DEFAULT_MODEL = "claude-opus-4-6";
export const MODELS = [
  { id: "claude-opus-4-6",          label: "Claude Opus 4.6（推奨・高品質）" },
  { id: "claude-sonnet-4-6",        label: "Claude Sonnet 4.6（高速・標準）" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5（最速・軽量）" }
];

/**
 * Generate a future value proposition from collected 3C notes.
 * @param {object} args
 * @param {string} args.apiKey  - Anthropic API key (sk-ant-...)
 * @param {string} args.model   - Model id
 * @param {{customer:string[], competitor:string[], company:string[]}} args.notes
 * @param {string} [args.title]
 * @returns {Promise<string>}   - Markdown text from the model
 */
export async function generateValueProp({ apiKey, model, notes, title }) {
  if (!apiKey || !apiKey.startsWith("sk-ant-")) {
    throw new Error("APIキー（sk-ant-...）を入力してください");
  }

  const userPrompt = buildPrompt(notes, title);
  const body = {
    model: model || DEFAULT_MODEL,
    max_tokens: 2400,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }]
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    let msg = `Claude API エラー (${res.status})`;
    try {
      const j = await res.json();
      msg = `${msg}: ${j.error?.message || JSON.stringify(j)}`;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  const data = await res.json();
  const text = data.content?.map(b => b.text || "").join("") || "";
  return text;
}

const SYSTEM_PROMPT = `あなたは経営戦略・マーケティングコンサルタントです。
ユーザーがワークショップで集めた「3C分析（顧客・競合・自社）」の付箋データを受け取り、独自の「未来バリュープロポジション」を3案提案してください。

未来バリュープロポジションとは、現在ではなく "数年後の市場を見据えて、競合が真似しにくく、顧客が強く求め、自社のリソースで実現可能な独自価値" のことです。

各案は次のフォーマットで Markdown で書いてください。

### 案 N: 〔キャッチーな提案名〕
- **ターゲット顧客**: …
- **独自価値**: …
- **根拠（3Cからの読み解き）**:
  - 顧客: …
  - 競合: …
  - 自社: …
- **すぐ取れる3つのアクション**:
  1. …
  2. …
  3. …

最後に「### 総合考察」として、3案を貫く戦略的方向性と次の一歩を 4-6 行で書いてください。日本語で簡潔に書いてください。`;

function buildPrompt(notes, title) {
  const c  = (notes.customer   || []).filter(Boolean);
  const co = (notes.competitor || []).filter(Boolean);
  const cp = (notes.company    || []).filter(Boolean);

  const fmt = arr => arr.length ? arr.map(t => `- ${t}`).join("\n") : "- （データなし）";

  return `セッション: ${title || "（無題）"}

## 顧客（Customer）からの声 ${c.length}件
${fmt(c)}

## 競合（Competitor）の印象・強み・弱み ${co.length}件
${fmt(co)}

## 自社（Company）のリソース・強み・挑戦したいこと ${cp.length}件
${fmt(cp)}

上記をもとに、未来バリュープロポジションを3案、続けて総合考察を出してください。`;
}
