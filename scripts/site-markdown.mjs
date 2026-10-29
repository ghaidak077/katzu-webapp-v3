/**
 * The markdown twin of every generated page.
 *
 * WHY IT EXISTS
 * An assistant that fetches a page to answer from it pays for the nav, the
 * footer, the inline reveal script and the stylesheet hooks, and then has to
 * guess which text was the article. The same page as markdown is the reader's
 * content and nothing else — the title, the headings, the paragraphs, the
 * tables, the FAQ and the sources — served from the same URL when the client
 * asks for it. Browsers ask for HTML and keep getting HTML.
 *
 * WHY IT IS DERIVED FROM THE HTML, NOT FROM THE PAGE OBJECTS
 * There is one `<main>` per page and every generator already fills it, while the
 * five page shapes (design template, copy pages, guides, hub, legal blocks) keep
 * their text in five different structures. Converting the rendered `<main>`
 * means the markdown cannot drift from the page a reader sees, and it cannot
 * quietly include something the page does not say. The nav, the footer and the
 * scripts are outside `<main>`, so they are excluded by construction rather than
 * by a list of things to strip.
 */

/** Named entities the pages actually use; anything else passes through. */
const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  copy: '©',
  middot: '·',
};

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    const named = ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}

/** Inline markup, in the order that keeps the replacements inside each other correct. */
function inline(html) {
  let text = html
    .replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/gi, '$1')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
      const clean = label.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      return clean ? `[${clean}](${href})` : '';
    })
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // Every tag that is not one of the inline forms above carries no meaning in
  // markdown: `span`, `time`, `abbr`, the decorative wrappers.
  text = text.replace(/<[^>]*>/g, '');
  return decodeEntities(text).replace(/[ \t\u00a0]+/g, ' ').trim();
}

/** One `<table>` as a GitHub-flavoured markdown table, header row first. */
function tableToMarkdown(tableHtml) {
  const rows = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((row) =>
      [...row[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map((cell) => {
        const text = inline(cell[1]).replace(/\|/g, '\\|');
        return text || ' ';
      }),
    )
    .filter((cells) => cells.length > 0);

  if (!rows.length) return '';
  const width = Math.max(...rows.map((cells) => cells.length));
  const pad = (cells) => [...cells, ...Array(width - cells.length).fill(' ')];
  const [header, ...body] = rows.map(pad);
  return [
    '',
    `| ${header.join(' | ')} |`,
    `| ${Array(width).fill('---').join(' | ')} |`,
    ...body.map((cells) => `| ${cells.join(' | ')} |`),
    '',
  ].join('\n');
}

/**
 * The `<main>` of one rendered page, as markdown.
 *
 * Blocks are marked first and the inline pass runs once over the whole result,
 * because a heading or a table cell can hold a link and the other order either
 * escapes it twice or loses it.
 */
export function htmlToMarkdown(html) {
  let text = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, '')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '');

  // Tables are pulled out first: their cells are the one place a newline would
  // break the markdown, and a placeholder keeps the block pass from seeing them.
  const tables = [];
  text = text.replace(/<table\b[\s\S]*?<\/table>/gi, (tableHtml) => {
    tables.push(tableToMarkdown(tableHtml));
    return `\n\n\u0000${tables.length - 1}\u0000\n\n`;
  });

  text = text
    // A list item is one line. Its inner `<p>`/`<div>` wrappers would otherwise
    // split it into a paragraph of its own, which is a different document.
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner) => {
      // Block wrappers only: a link or an emphasis inside the item is content.
      const line = inner
        .replace(/<\/?(?:p|div|span|section|article|ul|ol)\b[^>]*>/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return line ? `\n- ${line}` : '';
    })
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level, inner) => {
      return `\n\n${'#'.repeat(Number(level))} ${inner.replace(/\s+/g, ' ').trim()}\n\n`;
    })
    // The FAQ is a `<details>` per question; the question is the bold line and
    // the answer follows it.
    .replace(/<summary\b[^>]*>([\s\S]*?)<\/summary>/gi, '\n\n**$1**\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\b[^>]*>/gi, '\n\n---\n\n')
    .replace(/<blockquote\b[^>]*>/gi, '\n\n> ')
    .replace(/<\/(?:p|div|section|article|header|details|figure|figcaption|ul|ol|dl|blockquote)>/gi, '\n\n')
    .replace(/<(?:p|div|section|article|header|details|figure|figcaption|ul|ol|dl)\b[^>]*>/gi, '\n\n');

  text = inline(text);
  text = text.replace(/\u0000(\d+)\u0000/g, (_m, index) => tables[Number(index)] ?? '');

  const lines = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''));

  const tight = [];
  for (let i = 0; i < lines.length; i++) {
    // A `<li>` that wraps its text in a `<p>` left a blank line between items;
    // consecutive items are one list, not a loose one per element.
    const betweenItems = lines[i] === '' && /^- /.test(lines[i - 1] ?? '') && /^- /.test(lines[i + 1] ?? '');
    if (!betweenItems) tight.push(lines[i]);
  }

  return (
    tight
      .join('\n')
      // Blank-line runs become one, so the file is diffable and a paragraph
      // boundary is never three newlines deep.
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  );
}

/**
 * The markdown twin of one rendered document: its `<main>`, nothing else.
 *
 * A page with no `<main>` returns `null` rather than falling back to the whole
 * document — a twin that quietly includes the nav and the footer would be worse
 * than no twin at all.
 */
export function pageMarkdown(html) {
  const main = String(html).match(/<main\b[^>]*>([\s\S]*)<\/main>/i);
  if (!main) return null;
  const markdown = htmlToMarkdown(main[1]);
  return markdown.trim() ? markdown : null;
}
