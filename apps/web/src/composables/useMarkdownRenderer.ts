import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import { createHighlighter, type Highlighter as ShikiHighlighter } from 'shiki/bundle/web'
import { ref } from 'vue'
import { normalizeCodeLang } from '../lib/highlight-dom'

const SHIKI_LANGS = [
  'bash',
  'css',
  'html',
  'java',
  'javascript',
  'json',
  'markdown',
  'python',
  'shell',
  'sql',
  'tsx',
  'typescript',
  'vue',
  'yaml',
]

/**
 * 封装 MarkdownIt + Shiki 的渲染管线。
 *
 * 详情页（html: true，需要 DOMPurify）和知识库问答（html: false，纯文本答案）
 * 共用同一套代码高亮初始化。返回的 markdown 实例已注入 Shiki fence 规则，
 * highlighter 初始化完成后会触发渲染重算。
 */
export function useMarkdownRenderer(options: { html?: boolean } = {}) {
  const shikiHighlighter = ref<ShikiHighlighter | null>(null)

  const markdown = new MarkdownIt({
    html: options.html ?? false,
    linkify: true,
    breaks: true,
  })

  const defaultFence =
    markdown.renderer.rules.fence ||
    ((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts))

  markdown.renderer.rules.fence = (tokens, idx, opts, env, self) => {
    const highlighter = shikiHighlighter.value
    const token = tokens[idx]
    const lang = normalizeCodeLang(token.info)
    if (highlighter) {
      try {
        return highlighter.codeToHtml(token.content, {
          lang,
          theme: 'github-light',
        })
      } catch {
        // Fall back to markdown-it below.
      }
    }
    return defaultFence(tokens, idx, opts, env, self)
  }

  async function initShiki() {
    try {
      shikiHighlighter.value = await createHighlighter({
        themes: ['github-light'],
        langs: SHIKI_LANGS,
      })
    } catch {
      shikiHighlighter.value = null
    }
  }

  /**
   * 渲染 Markdown 并按需清洗。允许 HTML 时必须经过 DOMPurify 清洗，
   * 允许 figure / figcaption / target / rel / loading 等阅读区属性。
   */
  function render(source: string): string {
    if (!source) return ''
    const raw = markdown.render(source)
    if (!(options.html ?? false)) return raw
    return DOMPurify.sanitize(raw, {
      ADD_ATTR: ['target', 'rel', 'loading'],
      ADD_TAGS: ['figure', 'figcaption'],
    })
  }

  return {
    shikiHighlighter,
    markdown,
    initShiki,
    render,
  }
}
