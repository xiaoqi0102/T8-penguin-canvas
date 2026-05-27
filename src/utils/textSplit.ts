export type TextSplitMode =
  | 'paragraph'
  | 'line'
  | 'custom'
  | 'storyboard'
  | 'regex'
  | 'markdown-heading'
  | 'numbered'
  | 'char-chunk';

export type TextSplitRegexStrategy = 'split' | 'match';

export interface TextSplitOptions {
  mode?: TextSplitMode;
  delimiter?: string;
  chunkSize?: number;
  regexPattern?: string;
  regexFlags?: string;
  regexStrategy?: TextSplitRegexStrategy;
  removeEmpty?: boolean;
  trim?: boolean;
  normalizeSpaces?: boolean;
  stripNumbering?: boolean;
  prefix?: string;
  suffix?: string;
}

export const TEXT_SPLIT_MODE_LABEL: Record<TextSplitMode, string> = {
  paragraph: '按段落',
  line: '按行',
  custom: '自定义分隔',
  storyboard: '智能分镜',
  regex: '正则高级',
  'markdown-heading': '按 Markdown 标题',
  numbered: '按序号/镜头',
  'char-chunk': '按字数切块',
};

const CJK_NUMERAL = '一二三四五六七八九十百千万零〇两';
const STORYBOARD_LABEL = '(?:镜头|分镜|场景|Scene\\b|Shot\\b)';
const STORYBOARD_TITLE_RE = new RegExp(
  [
    '^\\s*(?:',
    '#{1,6}\\s+',
    '|[【\\[（(]?\\s*',
    `(?:${STORYBOARD_LABEL}\\s*(?:第\\s*)?(?:\\d{1,4}|[${CJK_NUMERAL}]+)?|第\\s*(?:\\d{1,4}|[${CJK_NUMERAL}]+)\\s*[镜幕场段章节])`,
    '\\s*[】\\]）)]?\\s*(?:[:：、.\\-—]\\s*)?',
    `|(?:\\d{1,4}|[${CJK_NUMERAL}]+)\\s*[.、)）:：\\-—]\\s+`,
    ')',
  ].join(''),
  'i'
);
const NUMBERING_RE = new RegExp(
  [
    '^\\s*(?:',
    '\\d+[\\.\\)、)]|[（(]\\d+[）)]',
    `|第[${CJK_NUMERAL}0-9]+[镜幕场段章节条]?[:：、.]?`,
    `|${STORYBOARD_LABEL}\\s*(?:第\\s*)?[${CJK_NUMERAL}0-9]*[:：、.]?`,
    ')\\s*',
  ].join(''),
  'i'
);

const PARAGRAPH_SEPARATOR_RE = /\n[ \t\f\v\u00a0\u1680\u2000-\u200f\u202f\u205f\u3000\ufeff]*\n+/;

function normalizeInput(input: string): string {
  return String(input || '').replace(/\r\n?/g, '\n').replace(/[\u2028\u2029]/g, '\n');
}

function splitByBlankParagraph(text: string): string[] {
  return text.split(PARAGRAPH_SEPARATOR_RE);
}

function splitByParagraph(text: string): string[] {
  return splitByBlankParagraph(text);
}

function applyCleanup(raw: string, opts: Required<Pick<TextSplitOptions, 'trim' | 'normalizeSpaces' | 'stripNumbering'>>): string {
  let s = raw;
  if (opts.stripNumbering) s = s.replace(NUMBERING_RE, '');
  if (opts.normalizeSpaces) {
    s = s
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' '))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');
  }
  if (opts.trim) s = s.trim();
  return s;
}

function fillTemplate(tpl: string, index: number, total: number): string {
  return String(tpl || '')
    .replace(/\{\{\s*index\s*\}\}/g, String(index))
    .replace(/\{\{\s*total\s*\}\}/g, String(total));
}

function applyAffixes(parts: string[], prefix = '', suffix = ''): string[] {
  if (!prefix && !suffix) return parts;
  const total = parts.length;
  return parts.map((part, idx) => {
    const i = idx + 1;
    return `${fillTemplate(prefix, i, total)}${part}${fillTemplate(suffix, i, total)}`;
  });
}

function splitByMarkdownHeading(text: string): string[] {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const isHeading = /^#{1,6}\s+\S/.test(line);
    if (isHeading && current.length > 0) {
      blocks.push(current.join('\n'));
      current = [];
    }
    current.push(line);
  }

  if (current.length > 0) blocks.push(current.join('\n'));
  return blocks.length > 1 ? blocks : splitByBlankParagraph(text);
}

function splitByNumbering(text: string): string[] {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const startsBlock = STORYBOARD_TITLE_RE.test(line) || NUMBERING_RE.test(line) || /^\s*[-*]\s+\S/.test(line);
    if (startsBlock && current.length > 0) {
      blocks.push(current.join('\n'));
      current = [];
    }
    current.push(line);
  }

  if (current.length > 0) blocks.push(current.join('\n'));
  if (blocks.length > 1) return blocks;
  const hasNumbering = lines.some((line) => STORYBOARD_TITLE_RE.test(line) || NUMBERING_RE.test(line) || /^\s*[-*]\s+\S/.test(line));
  return hasNumbering ? blocks : splitByBlankParagraph(text);
}

function splitByStoryboard(text: string): string[] {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const startsBlock =
      STORYBOARD_TITLE_RE.test(line) ||
      /^[-*]\s*(?:镜头|分镜|场景|Scene|Shot)\b/i.test(trimmed) ||
      /^(?:内景|外景|日景|夜景|清晨|黄昏)\s*[/-]\s*\S/.test(trimmed);
    if (startsBlock && current.length > 0) {
      blocks.push(current.join('\n'));
      current = [];
    }
    current.push(line);
  }

  if (current.length > 0) blocks.push(current.join('\n'));
  if (blocks.length > 1) return blocks;

  const numbered = splitByNumbering(text);
  if (numbered.length > 1) return numbered;
  return blocks.length > 0 ? blocks : splitByMarkdownHeading(text);
}

function splitByChunk(text: string, chunkSize: number): string[] {
  const max = Math.max(1, Math.min(5000, Math.floor(chunkSize || 600)));
  const parts: string[] = [];
  let rest = text.trim();
  const softBreakRe = /[\n。！？!?；;，,]\s*$/;

  while (rest.length > max) {
    let cut = -1;
    const search = rest.slice(0, max + 1);
    for (let i = search.length - 1; i >= Math.floor(max * 0.55); i -= 1) {
      if (softBreakRe.test(search.slice(0, i + 1))) {
        cut = i + 1;
        break;
      }
    }
    if (cut <= 0) cut = max;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

export function sanitizeTextSplitRegexFlags(flags = 'gm'): string {
  const allowed = new Set(['d', 'g', 'i', 'm', 's', 'u', 'v', 'y']);
  const out: string[] = [];
  for (const ch of String(flags || '')) {
    if (!allowed.has(ch) || out.includes(ch)) continue;
    out.push(ch);
  }
  return out.join('') || 'gm';
}

function splitByRegex(text: string, options: TextSplitOptions): string[] {
  const pattern = String(options.regexPattern || '').trim();
  if (!pattern) return splitByBlankParagraph(text);

  const strategy: TextSplitRegexStrategy = options.regexStrategy === 'match' ? 'match' : 'split';
  const flags = sanitizeTextSplitRegexFlags(options.regexFlags || 'gm');

  try {
    if (strategy === 'match') {
      const matchFlags = flags.includes('g') ? flags : `${flags}g`;
      const re = new RegExp(pattern, matchFlags);
      const matches: string[] = [];
      for (const match of text.matchAll(re)) {
        const picked = match.slice(1).find((item) => item != null && String(item).length > 0) || match[0];
        matches.push(picked);
      }
      return matches.length > 0 ? matches : splitByBlankParagraph(text);
    }

    const re = new RegExp(pattern, flags);
    return text.split(re);
  } catch {
    return splitByBlankParagraph(text);
  }
}

export function splitText(input: string, options: TextSplitOptions = {}): string[] {
  const mode = options.mode || 'line';
  const text = normalizeInput(input);
  const chunkSize = options.chunkSize || 600;

  let parts: string[];
  if (mode === 'line') {
    parts = text.split('\n');
  } else if (mode === 'custom') {
    const delimiter = options.delimiter || '';
    parts = delimiter ? text.split(delimiter) : splitByParagraph(text);
  } else if (mode === 'storyboard') {
    parts = splitByStoryboard(text);
  } else if (mode === 'regex') {
    parts = splitByRegex(text, options);
  } else if (mode === 'markdown-heading') {
    parts = splitByMarkdownHeading(text);
  } else if (mode === 'numbered') {
    parts = splitByNumbering(text);
  } else if (mode === 'char-chunk') {
    parts = splitByChunk(text, chunkSize);
  } else {
    parts = splitByParagraph(text);
  }

  const cleanupOptions = {
    trim: options.trim !== false,
    normalizeSpaces: Boolean(options.normalizeSpaces),
    stripNumbering: Boolean(options.stripNumbering),
  };

  let cleaned = parts.map((part) => applyCleanup(part, cleanupOptions));
  if (options.removeEmpty !== false) cleaned = cleaned.filter((part) => part.length > 0);
  return applyAffixes(cleaned, options.prefix, options.suffix);
}
