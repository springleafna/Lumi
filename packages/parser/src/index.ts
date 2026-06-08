import { Readability } from '@mozilla/readability';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import * as turndownPluginGfm from 'turndown-plugin-gfm';

export type ParseArticleInput = {
  html: string;
  url: string;
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
};

export type ParseFragmentInput = {
  html?: string;
  text?: string;
  url: string;
};

export async function parseArticleFromHtml(
  input: ParseArticleInput,
): Promise<ParsedArticle> {
  const dom = new JSDOM(input.html, { url: input.url });
  const document = dom.window.document;
  const readability = new Readability(document.cloneNode(true) as Document);
  const article = readability.parse();

  const fallbackTitle = getMeta(document, 'og:title') || document.title || input.url;
  const rawContent = article?.content || document.body?.innerHTML || '';
  const rawText =
    article?.textContent || document.body?.textContent || stripHtml(rawContent);

  const purifier = createDOMPurify(dom.window);
  const cleanHtml = purifier.sanitize(rawContent, {
    USE_PROFILES: { html: true },
  });

  const turndown = createTurndownService();

  const markdown = turndown.turndown(cleanHtml).trim();
  const contentText = normalizeText(rawText);

  return {
    title: article?.title || fallbackTitle,
    author: article?.byline || getMeta(document, 'author') || undefined,
    excerpt:
      article?.excerpt ||
      getMeta(document, 'description') ||
      getMeta(document, 'og:description') ||
      undefined,
    siteName: getMeta(document, 'og:site_name') || getSourceFromUrl(input.url),
    coverImage: getMeta(document, 'og:image') || undefined,
    publishedAt:
      getMeta(document, 'article:published_time') ||
      getMeta(document, 'pubdate') ||
      undefined,
    markdown,
    contentText,
    wordCount: countWords(contentText),
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
      const purifier = createDOMPurify(dom.window);
      const cleanHtml = purifier.sanitize(rawHtml, {
        USE_PROFILES: { html: true },
      });
      const markdown = createTurndownService().turndown(cleanHtml).trim();
      const contentText = normalizeText(
        dom.window.document.body?.textContent || rawText || '',
      );

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

function createTurndownService(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  turndown.use(turndownPluginGfm.gfm);
  return turndown;
}

function getMeta(document: Document, name: string): string | undefined {
  const escaped = name.replace(/"/g, '\\"');
  const element = document.querySelector(
    `meta[name="${escaped}"], meta[property="${escaped}"]`,
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

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
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
