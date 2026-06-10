import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import sanitizeHtml from 'sanitize-html';
import TurndownService from 'turndown';
import * as turndownPluginGfm from 'turndown-plugin-gfm';

export type ParseArticleInput = {
  html: string;
  url: string;
};

export type ParsedImageKind = 'content_image' | 'cover_image';

export type ParsedImageCandidate = {
  kind: ParsedImageKind;
  originalUrl: string;
  normalizedUrl: string;
  alt?: string;
  title?: string;
};

export type ParsedArticle = {
  title: string;
  author?: string;
  excerpt?: string;
  siteName?: string;
  coverImage?: string;
  publishedAt?: string;
  markdown: string;
  contentText: string;
  wordCount?: number;
  images?: ParsedImageCandidate[];
};

export type ParseFragmentInput = {
  html?: string;
  text?: string;
  url: string;
};

type ContentExtraction = {
  html: string;
  text: string;
  title?: string;
  author?: string;
  excerpt?: string;
};

const CONTENT_IMAGE_ATTRIBUTES = [
  'src',
  'data-src',
  'data-original',
  'data-lazy-src',
  'data-url',
  'data-image',
  'data-img-url',
  'data-actualsrc',
  'data-original-src',
];

const SRCSET_ATTRIBUTES = ['srcset', 'data-srcset', 'data-lazy-srcset'];

const NOISE_SELECTOR =
  [
    'nav',
    'footer',
    '[role="navigation"]',
    '[role="complementary"]',
    '[aria-label*="breadcrumb" i]',
    '[class*="breadcrumb" i]',
    '[class*="comment" i]',
    '[id*="comment" i]',
    '[class*="advert" i]',
    '[id*="advert" i]',
    '[class*="ad-" i]',
    '[class*="ads" i]',
    '[class*="share" i]',
    '[class*="social" i]',
    '[class*="related" i]',
    '[class*="recommend" i]',
    '[class*="newsletter" i]',
    '[class*="subscribe" i]',
    '[class*="login" i]',
    '[class*="popup" i]',
  ].join(',');

export async function parseArticleFromHtml(
  input: ParseArticleInput,
): Promise<ParsedArticle> {
  const dom = new JSDOM(input.html, { url: input.url });
  const document = dom.window.document;
  normalizeDocumentResources(document, input.url);

  const extraction = extractReadableContent(document, input.url);
  const contentDom = new JSDOM(`<main>${extraction.html}</main>`, { url: input.url });
  const contentRoot = contentDom.window.document.querySelector('main')!;
  removeNoiseNodes(contentRoot);
  normalizeDocumentResources(contentDom.window.document, input.url);

  const cleanHtml = sanitizeReaderHtml(contentRoot.innerHTML, input.url);
  const markdown = createTurndownService().turndown(cleanHtml).trim();
  const contentText = htmlToText(cleanHtml);
  const title =
    extraction.title ||
    getMeta(document, 'og:title') ||
    getMeta(document, 'twitter:title') ||
    document.title ||
    input.url;
  const coverImage = normalizeOptionalUrl(
    getMeta(document, 'og:image') ||
      getMeta(document, 'twitter:image') ||
      getMeta(document, 'twitter:image:src'),
    input.url,
  );

  return {
    title: normalizeText(title),
    author:
      normalizeText(
        extraction.author ||
          getMeta(document, 'author') ||
          getMeta(document, 'article:author') ||
          getMeta(document, 'byl') ||
          '',
      ) || undefined,
    excerpt:
      normalizeText(
        extraction.excerpt ||
          getMeta(document, 'description') ||
          getMeta(document, 'og:description') ||
          getMeta(document, 'twitter:description') ||
          '',
      ) || undefined,
    siteName: getMeta(document, 'og:site_name') || getSourceFromUrl(input.url),
    coverImage,
    publishedAt:
      getMeta(document, 'article:published_time') ||
      getMeta(document, 'datePublished') ||
      getMeta(document, 'date') ||
      getMeta(document, 'pubdate') ||
      undefined,
    markdown,
    contentText,
    wordCount: countWords(contentText),
    images: collectImageCandidates(contentRoot, input.url),
  };
}

export async function parseFragmentToMarkdown(
  input: ParseFragmentInput,
): Promise<Pick<ParsedArticle, 'markdown' | 'contentText' | 'wordCount' | 'siteName'>> {
  const rawHtml = input.html?.trim();
  const rawText = input.text?.trim();

  if (rawHtml) {
    try {
      const dom = new JSDOM(`<main>${rawHtml}</main>`, { url: input.url });
      normalizeDocumentResources(dom.window.document, input.url);
      const main = dom.window.document.querySelector('main')!;
      removeNoiseNodes(main);
      const cleanHtml = sanitizeReaderHtml(main.innerHTML, input.url);
      const markdown = createTurndownService().turndown(cleanHtml).trim();
      const contentText = htmlToText(cleanHtml) || normalizeText(rawText || '');

      if (markdown || contentText) {
        return {
          markdown: markdown || textToMarkdown(contentText),
          contentText,
          wordCount: countWords(contentText),
          siteName: getSourceFromUrl(input.url),
        };
      }
    } catch {
      // Fall back to plain text below.
    }
  }

  const contentText = normalizeText(rawText || stripHtml(rawHtml || ''));
  return {
    markdown: textToMarkdown(contentText),
    contentText,
    wordCount: countWords(contentText),
    siteName: getSourceFromUrl(input.url),
  };
}

export function parseMarkdownDocument(input: {
  content: string;
  filename: string;
}): Pick<ParsedArticle, 'title' | 'markdown' | 'contentText' | 'wordCount'> {
  const markdown = input.content.trim();
  const title = extractMarkdownTitle(markdown) || filenameToTitle(input.filename);
  const contentText = markdownToText(markdown);

  return {
    title,
    markdown,
    contentText,
    wordCount: countWords(contentText),
  };
}

export function parseTextDocument(input: {
  content: string;
  filename: string;
}): Pick<ParsedArticle, 'title' | 'markdown' | 'contentText' | 'wordCount'> {
  const contentText = normalizeText(input.content);

  return {
    title: filenameToTitle(input.filename),
    markdown: textToMarkdown(input.content),
    contentText,
    wordCount: countWords(contentText),
  };
}

function extractReadableContent(document: Document, url: string): ContentExtraction {
  const readabilityDocument = document.cloneNode(true) as Document;
  removeNoiseNodes(readabilityDocument.body);
  const article = new Readability(readabilityDocument).parse();
  const fallback = buildFallbackContent(document);

  if (article?.content && isMeaningfulContent(article.textContent || '', fallback.text)) {
    return {
      html: article.content,
      text: article.textContent || fallback.text,
      title: article.title || undefined,
      author: article.byline || undefined,
      excerpt: article.excerpt || undefined,
    };
  }

  return {
    ...fallback,
    title: fallback.title || document.title || url,
  };
}

function buildFallbackContent(document: Document): ContentExtraction {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      'article, main, [role="main"], .article, .post, .entry, .content, .post-content, .article-content',
    ),
  );
  candidates.push(document.body);

  let best: HTMLElement | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const clone = candidate.cloneNode(true) as HTMLElement;
    removeNoiseNodes(clone);
    const text = normalizeText(clone.textContent || '');
    const paragraphCount = clone.querySelectorAll('p, li, blockquote').length;
    const score = text.length + paragraphCount * 80;
    if (score > bestScore) {
      best = clone;
      bestScore = score;
    }
  }

  const source = best || document.body;
  return {
    html: source.innerHTML || '',
    text: normalizeText(source.textContent || ''),
    title: document.querySelector('h1')?.textContent?.trim() || undefined,
  };
}

function isMeaningfulContent(articleText = '', fallbackText = '') {
  const articleLength = normalizeText(articleText).length;
  const fallbackLength = normalizeText(fallbackText).length;

  if (articleLength >= 240) return true;
  if (fallbackLength === 0) return articleLength > 0;
  return articleLength >= Math.min(240, fallbackLength * 0.35);
}

function removeNoiseNodes(root?: Element | null) {
  if (!root) return;
  for (const element of Array.from(root.querySelectorAll(NOISE_SELECTOR))) {
    element.remove();
  }
}

function normalizeDocumentResources(document: Document, baseUrl: string) {
  normalizeImages(document, baseUrl);
  normalizeLinks(document, baseUrl);
}

function normalizeLinks(document: Document, baseUrl: string) {
  for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const normalized = normalizeOptionalUrl(link.getAttribute('href'), baseUrl);
    if (!normalized) {
      link.removeAttribute('href');
      continue;
    }

    link.setAttribute('href', normalized);
    if (isExternalUrl(normalized, baseUrl)) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  }
}

function normalizeImages(document: Document, baseUrl: string) {
  for (const picture of Array.from(document.querySelectorAll('picture'))) {
    const image = picture.querySelector<HTMLImageElement>('img');
    if (!image) continue;
    const pictureSource = Array.from(picture.querySelectorAll('source'))
      .map((source) => getBestSrcsetUrl(source.getAttribute('srcset'), baseUrl))
      .find(Boolean);
    if (!image.getAttribute('src') && pictureSource) {
      image.setAttribute('src', pictureSource);
    }
  }

  for (const image of Array.from(document.querySelectorAll<HTMLImageElement>('img'))) {
    const src = pickImageUrl(image, baseUrl);
    if (!src) continue;
    image.setAttribute('src', src);
    image.setAttribute('loading', 'lazy');
    image.removeAttribute('srcset');
    image.removeAttribute('sizes');
  }
}

function pickImageUrl(image: HTMLImageElement, baseUrl: string) {
  for (const attribute of CONTENT_IMAGE_ATTRIBUTES) {
    const normalized = normalizeOptionalUrl(image.getAttribute(attribute), baseUrl);
    if (normalized) return normalized;
  }

  for (const attribute of SRCSET_ATTRIBUTES) {
    const normalized = getBestSrcsetUrl(image.getAttribute(attribute), baseUrl);
    if (normalized) return normalized;
  }

  return undefined;
}

function getBestSrcsetUrl(value: string | null, baseUrl: string) {
  if (!value) return undefined;

  const candidates = value
    .split(',')
    .map((part) => {
      const [rawUrl, rawDescriptor] = part.trim().split(/\s+/, 2);
      const normalized = normalizeOptionalUrl(rawUrl, baseUrl);
      if (!normalized) return null;
      const descriptor = rawDescriptor || '';
      const widthMatch = descriptor.match(/^(\d+)w$/);
      const densityMatch = descriptor.match(/^([\d.]+)x$/);
      const score = widthMatch
        ? Number(widthMatch[1])
        : densityMatch
          ? Number(densityMatch[1]) * 1000
          : 0;
      return { url: normalized, score };
    })
    .filter((item): item is { url: string; score: number } => Boolean(item));

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.url;
}

function collectImageCandidates(
  root: ParentNode,
  baseUrl: string,
): ParsedImageCandidate[] {
  const candidates: ParsedImageCandidate[] = [];
  const seen = new Set<string>();

  for (const image of Array.from(root.querySelectorAll<HTMLImageElement>('img[src]'))) {
    const originalUrl = image.getAttribute('src') || '';
    const normalizedUrl = normalizeOptionalUrl(originalUrl, baseUrl);
    if (!normalizedUrl || seen.has(normalizedUrl)) continue;
    seen.add(normalizedUrl);
    candidates.push({
      kind: 'content_image',
      originalUrl,
      normalizedUrl,
      alt: image.getAttribute('alt')?.trim() || undefined,
      title: image.getAttribute('title')?.trim() || undefined,
    });
  }

  return candidates;
}

function sanitizeReaderHtml(html: string, baseUrl: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'blockquote',
      'ul',
      'ol',
      'li',
      'pre',
      'code',
      'a',
      'img',
      'figure',
      'figcaption',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'hr',
      'del',
      'sup',
      'sub',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'loading'],
      code: ['class'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: {
      img: ['http', 'https'],
    },
    transformTags: {
      a: (_tagName, attribs) => {
        const href = normalizeOptionalUrl(attribs.href, baseUrl);
        const nextAttributes: Record<string, string> = {};
        if (href) {
          nextAttributes.href = href;
          if (attribs.title) nextAttributes.title = attribs.title;
          if (isExternalUrl(href, baseUrl)) {
            nextAttributes.target = '_blank';
            nextAttributes.rel = 'noopener noreferrer';
          }
        }
        return { tagName: 'a', attribs: nextAttributes };
      },
      img: (_tagName, attribs) => {
        const src = normalizeOptionalUrl(attribs.src, baseUrl);
        if (!src) {
          return { tagName: 'span', attribs: {} as Record<string, string> };
        }
        const nextAttributes: Record<string, string> = {
          src,
          alt: attribs.alt || '',
          loading: 'lazy',
        };
        if (attribs.title) nextAttributes.title = attribs.title;
        return {
          tagName: 'img',
          attribs: nextAttributes,
        };
      },
    },
  });
}

function createTurndownService(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  turndown.use(turndownPluginGfm.gfm);
  turndown.addRule('figure', {
    filter: 'figure',
    replacement(content) {
      return `\n\n${content.trim()}\n\n`;
    },
  });
  turndown.addRule('figcaption', {
    filter: 'figcaption',
    replacement(content) {
      const text = content.trim();
      return text ? `\n\n_${text}_\n\n` : '';
    },
  });
  return turndown;
}

function getMeta(document: Document, name: string): string | undefined {
  const escaped = name.replace(/"/g, '\\"');
  const element = document.querySelector(
    `meta[name="${escaped}"], meta[property="${escaped}"], meta[itemprop="${escaped}"]`,
  );
  const value = element?.getAttribute('content')?.trim();
  return value || undefined;
}

function getSourceFromUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function normalizeOptionalUrl(value: string | null | undefined, baseUrl: string) {
  const raw = value?.trim();
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return undefined;

  try {
    const url = new URL(raw, baseUrl);
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function isExternalUrl(value: string, baseUrl: string) {
  try {
    return new URL(value).origin !== new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function htmlToText(html: string): string {
  const dom = new JSDOM(`<main>${html}</main>`);
  return normalizeText(dom.window.document.body?.textContent || '');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ');
}

function countWords(text: string): number {
  const normalized = normalizeText(text);
  if (!normalized) {
    return 0;
  }

  const latinWords = normalized.match(/[A-Za-z0-9]+/g)?.length ?? 0;
  const cjkChars = normalized.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  return latinWords + cjkChars;
}

function extractMarkdownTitle(markdown: string): string | undefined {
  const match = markdown.match(/^#\s+(.+?)\s*$/m);
  return match?.[1]?.trim() || undefined;
}

function filenameToTitle(filename: string): string {
  const normalized = filename.trim().replace(/\.[^.]+$/, '');
  return normalized || '未命名文档';
}

function markdownToText(markdown: string): string {
  return normalizeText(
    markdown
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
      .replace(/[#>*_~`|[\]-]+/g, ' '),
  );
}

function textToMarkdown(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join('\n\n');
}
