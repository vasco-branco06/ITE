// Parser for IDs, definitions, references and links (rule 03, specs/coherence-checker.md steps 1-3).
// Definitions follow rule 03.2: a heading or a bold list item that starts with the ID. Table rows are references.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const EXCLUDED = new Set(['node_modules', '.git', '.claude', '.arena', 'plugin', 'app', 'validation', 'founder', 'replica']);
const ID = /\b(?:[RDSPT]-\d{3}|F-\d+(?:\.\d+)*)\b/g;
const BAD_ID = /\b[RDSPT]-\d+\b/g;
const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const HEADING = /^(#{1,6})\s+(\S+)(.*)$/;
const BOLD_ITEM = /^\s*[-*]\s+\*\*([^*]+)\*\*(.*)$/;
const isId = (s) => new RegExp(`^${ID.source}$`).test(s);
const idsIn = (text) => text.match(ID) ?? [];

// Lines with code blanked out: fenced blocks entirely, inline code spans by spaces (line numbers stay true).
function codeFree(text) {
  let fence = null;
  return text.replace(/\r\n/g, '\n').split('\n').map((line) => {
    const m = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
      return '';
    }
    if (m) { fence = m[1]; return ''; }
    return line.replace(/`+[^`]*`+/g, (s) => ' '.repeat(s.length));
  });
}

// "- **Tripwire:** T-002" or "Used by: R-001 · Tested by: T-001" -> { tripwire: { text, ids } }
function labelsOf(lines) {
  const labels = {};
  for (const raw of lines) {
    const line = raw.replace(/^\s*[-*]\s+/, '').replace(/\*\*/g, '');
    for (const seg of line.split(' · ')) {
      const m = /^\s*([A-Za-z][A-Za-z ]*?):\s*(.*)$/.exec(seg);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const prev = labels[key] ?? { text: '', ids: [] };
      labels[key] = { text: prev.text ? `${prev.text} ${m[2]}` : m[2], ids: [...prev.ids, ...idsIn(m[2])] };
    }
  }
  return labels;
}

export function parseMarkdown(text, file) {
  const lines = codeFree(text);
  const definitions = [];
  const references = [];
  const badIds = [];
  const links = [];
  let section = null;

  lines.forEach((line, i) => {
    const h = HEADING.exec(line);
    if (h && h[1].length === 2) section = `${h[2]}${h[3]}`.trim();
    const b = h ? null : BOLD_ITEM.exec(line);
    const token = h ? h[2] : b ? b[1].trim() : null;
    const defined = token && isId(token) ? token : null;

    if (defined) {
      // A heading owns the lines up to the next heading; a list item owns its indented continuation lines.
      let end = i + 1;
      if (h) while (end < lines.length && !HEADING.test(lines[end])) end++;
      else while (end < lines.length && /^\s+\S/.test(lines[end]) && !BOLD_ITEM.test(lines[end])) end++;
      const block = lines.slice(i, end);
      const body = [h ? h[3] : b[2], ...block.slice(1)].join('\n');
      const labels = labelsOf(block.slice(h ? 1 : 0));
      const arrow = (h ? h[3] : b[2]).split('→')[1];
      definitions.push({
        id: defined, file, line: i + 1, level: h ? h[1].length : 0,
        title: (h ? h[3] : b[2]).trim(), section,
        status: /^withdrawn\b/i.test(labels.status?.text ?? '') ? 'withdrawn' : 'active',
        assumption: /^assumptions\b/i.test(section ?? '') || /\*\*Assumption:\*\*/.test(body),
        labels, arrow: arrow ? idsIn(arrow) : [], refs: idsIn(body).filter((x) => x !== defined),
      });
    }

    let skip = defined;
    for (const id of idsIn(line)) {
      if (id === skip) { skip = null; continue; }
      references.push({ id, file, line: i + 1 });
    }
    for (const tok of line.match(BAD_ID) ?? []) if (!isId(tok)) badIds.push({ token: tok, file, line: i + 1 });
    for (const m of line.matchAll(LINK)) {
      const target = m[1].replace(/\\/g, '/').replace(/#.*$/, '');
      if (target) links.push({ target, file, line: i + 1 });
    }
  });
  return { definitions, references, badIds, links };
}

function walk(root, rel = '') {
  return readdirSync(join(root, rel), { withFileTypes: true }).flatMap((e) => {
    if (EXCLUDED.has(e.name)) return [];
    const p = rel ? `${rel}/${e.name}` : e.name;
    return e.isDirectory() ? walk(root, p) : [p];
  });
}

const lineOf = (text, needle) => text.replace(/\r\n/g, '\n').split('\n').findIndex((l) => l.includes(needle)) + 1 || null;

// Parses a whole spec folder. Never throws on bad content; unreadable JSON goes to jsonErrors.
export function parseFolder(root) {
  const files = walk(root).sort();
  const out = { files, definitions: [], references: [], badIds: [], links: [], cases: null, schemas: [], coverage: null, jsonErrors: [] };
  const json = (file, text) => {
    try { return JSON.parse(text); } catch (e) { out.jsonErrors.push({ file, message: e.message }); return undefined; }
  };
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');
    if (file.endsWith('.md')) {
      const p = parseMarkdown(text, file);
      for (const k of ['definitions', 'references', 'badIds', 'links']) out[k].push(...p[k]);
    } else if (file === 'tests/cases.json') {
      const data = json(file, text);
      if (data) out.cases = (Array.isArray(data.cases) ? data.cases : []).map((c) => ({
        id: c.id, title: c.title, proves: c.proves ?? [], kind: c.kind, line: lineOf(text, `"id": ${JSON.stringify(c.id)}`),
      }));
    } else if (/^schemas\/[^/]+\.schema\.json$/.test(file)) {
      const data = json(file, text);
      if (data) out.schemas.push({ file, id: data.$id ?? null, line: lineOf(text, '"$id"'), schema: data });
    } else if (file === '.ite/coverage.json') {
      const data = json(file, text);
      if (data) out.coverage = data;
    }
  }
  return out;
}
