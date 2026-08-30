import type { AnnotationDto } from '@lumi/shared'

/**
 * 阅读区高亮与选区的纯 DOM 算法集合。
 *
 * 这些函数不依赖 Vue 响应式，只操作标准 DOM API，便于单独测试与在
 * 不同组件间复用。偏移量一律以正文容器的 textContent 文本流为基准。
 */

type WrapOptions = {
  className: string
  annotationId?: string
  citation?: boolean
}

/**
 * 在 root 下把 [startOffset, endOffset) 文本区间包裹成 <mark> 元素。
 *
 * 由于文本可能横跨多个文本节点，这里先用 TreeWalker 收集所有文本节点
 * 的全局偏移，再从后往前 surroundContents，避免前置插入打乱后续偏移。
 * surroundContents 失败（例如跨越元素边界）时静默保留原文，不抛错。
 */
export function wrapTextRange(
  root: Element,
  startOffset: number,
  endOffset: number,
  options: WrapOptions,
): void {
  const nodes: Array<{ node: Text; start: number; end: number }> = []
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let currentOffset = 0
  let current = walker.nextNode()

  while (current) {
    const node = current as Text
    const length = node.data.length
    nodes.push({ node, start: currentOffset, end: currentOffset + length })
    currentOffset += length
    current = walker.nextNode()
  }

  for (const item of nodes.reverse()) {
    const localStart = Math.max(startOffset, item.start) - item.start
    const localEnd = Math.min(endOffset, item.end) - item.start
    if (localStart < 0 || localEnd > item.node.data.length || localStart >= localEnd) continue

    const range = root.ownerDocument.createRange()
    range.setStart(item.node, localStart)
    range.setEnd(item.node, localEnd)
    const span = root.ownerDocument.createElement('mark')
    span.className = options.className
    if (options.annotationId) {
      span.dataset.annotationId = options.annotationId
    }
    if (options.citation) {
      span.dataset.citationHighlight = 'true'
    }
    try {
      range.surroundContents(span)
    } catch {
      // Keep the original text if the browser cannot wrap this range.
    }
  }
}

/**
 * 把高亮批注和引用区间应用到渲染后的 HTML 上，返回处理后的 HTML 字符串。
 *
 * 批注按 startOffset 降序处理，保证后插入的标记不影响前面区间的偏移。
 */
export function applyReaderHighlights(
  html: string,
  items: AnnotationDto[],
  citation: { startOffset: number; endOffset: number } | null,
): string {
  if (!items.length && !citation) return html
  if (typeof DOMParser === 'undefined') return html

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<main>${html}</main>`, 'text/html')
  const root = doc.body.firstElementChild
  if (!root) return html

  for (const annotation of [...items].sort((a, b) => b.startOffset - a.startOffset)) {
    wrapTextRange(root, annotation.startOffset, annotation.endOffset, {
      className: 'reader-annotation-mark',
      annotationId: annotation.id,
    })
  }

  if (citation) {
    wrapTextRange(root, citation.startOffset, citation.endOffset, {
      className: 'reader-citation-mark',
      citation: true,
    })
  }

  return root.innerHTML
}

/**
 * 计算一个 Range 相对 root 的文本偏移区间。
 *
 * 思路是分别构造两个从 root 起点到选区起点 / 终点的 Range，用其
 * toString().length 作为偏移。无法计算（终点 <= 起点）时返回 null。
 */
export function getSelectionOffsets(
  root: HTMLElement,
  range: Range,
): { startOffset: number; endOffset: number } | null {
  const startRange = globalThis.document.createRange()
  startRange.selectNodeContents(root)
  startRange.setEnd(range.startContainer, range.startOffset)

  const endRange = globalThis.document.createRange()
  endRange.selectNodeContents(root)
  endRange.setEnd(range.endContainer, range.endOffset)

  const startOffset = startRange.toString().length
  const endOffset = endRange.toString().length
  if (endOffset <= startOffset) return null
  return { startOffset, endOffset }
}

/**
 * 判断 [startOffset, endOffset) 是否与已有批注区间重叠。
 */
export function hasAnnotationOverlap(
  items: AnnotationDto[],
  startOffset: number,
  endOffset: number,
): boolean {
  return items.some((item) => item.startOffset < endOffset && item.endOffset > startOffset)
}

/**
 * 统计选中文本在 offset 之前出现过多少次，用于批注定位去歧义。
 */
export function countOccurrencesBefore(text: string, selectedText: string, offset: number): number {
  const before = text.slice(0, offset)
  if (!selectedText) return 0
  let count = 0
  let index = before.indexOf(selectedText)
  while (index >= 0) {
    count += 1
    index = before.indexOf(selectedText, index + selectedText.length)
  }
  return count
}

/**
 * 把代码围栏的语言别名规范化为 Shiki 支持的语言 id。
 */
export function normalizeCodeLang(info: string): string {
  const lang = info.trim().split(/\s+/)[0]?.toLowerCase() || 'text'
  if (lang === 'js') return 'javascript'
  if (lang === 'ts') return 'typescript'
  if (lang === 'sh' || lang === 'zsh') return 'shell'
  if (lang === 'yml') return 'yaml'
  return lang
}

/**
 * 规范化目录标题文本：折叠空白并去除首尾空白。
 */
export function normalizeTocTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
