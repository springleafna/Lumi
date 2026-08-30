import { onBeforeUnmount, ref } from 'vue'
import { normalizeTocTitle } from '../lib/highlight-dom'

export type TocItem = {
  id: string
  title: string
  level: number
}

/**
 * 从渲染后的正文容器中提取 h2 / h3 生成运行时目录，并用
 * IntersectionObserver 跟踪当前可见章节。
 *
 * 阅读区正文是 v-html 注入的，标题 id 在渲染后才能确定，因此 TOC
 * 必须在内容变化后手动 refresh。少于两个标题时不显示目录。
 * 移动端整页随 window 滚动，观察 root 用视口本身。
 */
export function useRuntimeToc() {
  const tocItems = ref<TocItem[]>([])
  const activeTocId = ref('')
  let headingObserver: IntersectionObserver | null = null

  function disconnect() {
    headingObserver?.disconnect()
    headingObserver = null
  }

  /**
   * 重新扫描 container 内的标题并重建观察者。
   * enabled 为 false 时（例如文章尚未解析完成）直接清空目录。
   */
  function refresh(container: HTMLElement | null, enabled: boolean) {
    disconnect()
    tocItems.value = []
    activeTocId.value = ''

    if (!container || !enabled) return

    const headings = Array.from(container.querySelectorAll<HTMLElement>('h2, h3'))
    const items: TocItem[] = []

    headings.forEach((heading, index) => {
      const title = normalizeTocTitle(heading.textContent || '')
      const level = heading.tagName.toLowerCase() === 'h3' ? 3 : 2
      const id = `heading-${index}`
      heading.id = id
      if (title) {
        items.push({ id, title, level })
      }
    })

    if (items.length < 2) return

    tocItems.value = items
    activeTocId.value = items[0]?.id || ''
    observe(headings)
  }

  function observe(headings: HTMLElement[]) {
    if (typeof IntersectionObserver === 'undefined') return

    headingObserver = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visibleEntry?.target instanceof HTMLElement) {
          activeTocId.value = visibleEntry.target.id
        }
      },
      {
        root: null,
        rootMargin: '-60px 0px -70% 0px',
        threshold: [0, 1],
      },
    )

    for (const heading of headings) {
      headingObserver.observe(heading)
    }
  }

  function scrollToHeading(id: string) {
    globalThis.document.getElementById(id)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  onBeforeUnmount(disconnect)

  return {
    tocItems,
    activeTocId,
    refresh,
    scrollToHeading,
  }
}
