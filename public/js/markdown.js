// Tiny Markdown → HTML renderer used by the step pages.
// Supports: headings (#〜###), bullet / numbered lists, **bold**, `code`,
// GFM tables, and paragraphs. Everything is HTML-escaped first.

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inline(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}
function splitRow(line) {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map(c => c.trim());
}
const isSeparator = line => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

export function renderMarkdown(md) {
  const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let inList = null;
  const closeList = () => { if (inList) { out.push(`</${inList}>`); inList = null; } };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = esc(raw);

    // GFM table: header row + separator row
    if (raw.includes("|") && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      closeList();
      const head = splitRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitRow(esc(lines[i])));
        i++;
      }
      i--; // loop will ++
      out.push('<div class="md-table-wrap"><table class="md-table"><thead><tr>' +
        head.map(c => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>" +
        rows.map(r => "<tr>" + head.map((_, k) => `<td>${inline(r[k] || "")}</td>`).join("") + "</tr>").join("") +
        "</tbody></table></div>");
      continue;
    }

    const h  = line.match(/^(#{1,3})\s+(.*)$/);
    const ul = line.match(/^\s*[-*・]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (h)        { closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); }
    else if (ul)  { if (inList !== "ul") { closeList(); out.push("<ul>"); inList = "ul"; } out.push(`<li>${inline(ul[1])}</li>`); }
    else if (ol)  { if (inList !== "ol") { closeList(); out.push("<ol>"); inList = "ol"; } out.push(`<li>${inline(ol[1])}</li>`); }
    else if (line.trim() === "") { closeList(); }
    else if (/^\s*-{3,}\s*$/.test(line)) { closeList(); out.push("<hr>"); }
    else          { closeList(); out.push(`<div>${inline(line)}</div>`); }
  }
  closeList();
  return out.join("\n");
}

/** Extract unique #RRGGBB colors from text (used by the creative step). */
export function extractHexColors(text) {
  const seen = new Set();
  const out = [];
  for (const m of String(text || "").matchAll(/#([0-9a-fA-F]{6})\b/g)) {
    const hex = "#" + m[1].toUpperCase();
    if (!seen.has(hex)) { seen.add(hex); out.push(hex); }
  }
  return out;
}
