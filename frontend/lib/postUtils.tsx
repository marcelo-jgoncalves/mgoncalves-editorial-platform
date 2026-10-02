
import { createHighlighter } from 'shiki';
import * as cheerio from 'cheerio';

export interface Heading {
  id: string;
  text: string;
}

export interface ProcessedPost {
  contentHtml: string;
  headings: Heading[];
}

// Old inline images were saved with the "base" URL (no variant suffix),
// which never exists in the assets bucket: only -480/-768/-1280 exist. Normalizes
// to the desktop variant (-1280), matching what the admin writes for new uploads.
const MEDIA_IMG_RE = /^(https?:\/\/[^"'?]*\/media\/[^"'?]+?)(-(?:480|768|1280))?\.(avif|webp|jpe?g|png|gif)(\?[^"']*)?$/i;

export function normalizeMediaImageSrc(src: string): string {
  const match = src.match(MEDIA_IMG_RE);
  if (!match) return src;
  const [, base, sizeSuffix, ext, query = ''] = match;
  if (sizeSuffix) return src;
  return `${base}-1280.${ext}${query}`;
}

export async function processFullPostContent(html: string): Promise<ProcessedPost> {
  const headings: Heading[] = [];

  // --- PHASE 1: Syntax Highlighting (String Manipulation) ---
  
  const highlighter = await createHighlighter({
    themes: ['dark-plus'],
    langs: ['terraform', 'javascript', 'bash', 'json', 'yaml', 'python', 'typescript', 'go', 'sql', 'docker', 'css', 'html']
  });

  let preProcessedHtml = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, '').trim();

  const codeBlockRegex = /<pre><code class="language-([^">]+)">([\s\S]*?)<\/code><\/pre>/g;
  
  const matches = Array.from(preProcessedHtml.matchAll(codeBlockRegex));

  for (const match of matches) {
    const [fullMatch, lang, code] = match;
    
    // Shiki expects raw code, not HTML-escaped entities (e.g. &lt;div&gt; must
    // become <div> before highlighting, or the output gets double-escaped).
    const rawCode = code
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'");

    try {
      const highlighted = highlighter.codeToHtml(rawCode, { lang, theme: 'dark-plus' });
      preProcessedHtml = preProcessedHtml.replace(fullMatch, highlighted);
    } catch {
      // Language not supported by Shiki: keep the original unhighlighted block
    }
  }

 const $ = cheerio.load(preProcessedHtml, {
    xmlMode: false
  });

  $('img').each((_, elem) => {
    const $el = $(elem);
    const src = $el.attr('src');
    if (src) $el.attr('src', normalizeMediaImageSrc(src));
  });

  // Found during the Block 5 full audit (docs/book/cases/CASE-008): two H2s
  // with the same text (e.g. "Conclus\u00e3o" reused across sections, a real
  // pattern in longer technical posts comparing several options) used to
  // collide on the same slug id. Duplicate HTML ids are invalid, and
  // document.getElementById() (TableOfContents.tsx's click handler and
  // scroll-spy) always resolves to the FIRST element with that id - the
  // second heading's TOC entry would silently scroll to the first section
  // instead, and the scroll-spy would track them as the same target.
  const seenHeadingIds = new Map<string, number>();
  $('h2').each((_, elem) => {
    const $el = $(elem);
    const text = $el.text();
    const baseId = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');

    const seenCount = seenHeadingIds.get(baseId) ?? 0;
    seenHeadingIds.set(baseId, seenCount + 1);
    const id = seenCount === 0 ? baseId : `${baseId}-${seenCount}`;

    $el.attr('id', id);
    headings.push({ id, text });
  });

  const $body = $('body');

  // Tiptap sometimes wraps content in multiple nested <div>s. Descend until
  // a container with more than 1 child is found.
  let $container = $body;
  let depth = 0;
  while (depth < 5) {
    const children = $container.children();
    if (children.length !== 1 || !children.first().is('div, article, section, main')) break;
    $container = children.first() as unknown as typeof $body;
    depth++;
  }

  const directChildren = $container.children();
  const totalChildren = directChildren.length;

  const TARGET_ADS_INDEX = Math.floor(totalChildren / 2);
  let adsInjected = false;

  directChildren.each((index, element) => {
    if (index >= totalChildren - 1) return;

    const $current = $(element);
    const isHeading = $current.is('h2, h3, h4, h5, h6');
    const isImage = $current.is('figure, img') || $current.find('img').length > 0;

    if (!adsInjected && index >= TARGET_ADS_INDEX && !isHeading && !isImage) {
      $current.after('\n<div id="inject-ads-placeholder"></div>\n');
      adsInjected = true;
    }
  });

  return {
    contentHtml: $('body').html() || '',
    headings
  };
}