import { onBeforeUnmount, ref } from 'vue'
import type { AnnotationDto } from '@lumi/shared'
import {
  countOccurrencesBefore,
  getSelectionOffsets,
  hasAnnotationOverlap,
} from '../lib/highlight-dom'

export type SelectionDraft = {
  selectedText: string
  prefix: string
  suffix: string
  occurrenceIndex: number
  startOffset: number
  endOffset: number
}

export type SelectionToolbarState = {
  visible: boolean
  x: number
  y: number
  placement: 'top' | 'bottom'
}

const MAX_SELECTION_CHARS = 2000
const SELECTION_DEBOUNCE_MS = 350

/**
 * 触屏划词检测：长按选择、句柄拖动都会连续触发 selectionchange，
 * 防抖后统一解析。Web 端绑定的 @mouseup 在触屏上不会触发，这里
 * 是移动端划词的核心入口。浮条定位在选区上方，顶部空间不足翻到下方。
 */
export function useReaderSelection(options: {
  container: () => HTMLElement | null
  annotations: () => AnnotationDto[]
  onOverlap: () => void
  onTooLong: () => void
}) {
  const draft = ref<SelectionDraft | null>(null)
  const toolbar = ref<SelectionToolbarState>({ visible: false, x: 0, y: 0, placement: 'top' })

  let debounceTimer: number | undefined

  function clearDraft() {
    draft.value = null
    toolbar.value = { ...toolbar.value, visible: false }
  }

  function clearSelection() {
    globalThis.document.getSelection()?.removeAllRanges()
    clearDraft()
  }

  function handleSelectionChange() {
    if (debounceTimer !== undefined) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(evaluateSelection, SELECTION_DEBOUNCE_MS)
  }

  function evaluateSelection() {
    debounceTimer = undefined
    const selection = globalThis.document.getSelection()
    const text = selection?.toString() ?? ''
    const container = options.container()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !text.trim()) {
      clearDraft()
      return
    }

    const range = selection.getRangeAt(0)
    if (!container || !container.contains(range.commonAncestorContainer)) {
      clearDraft()
      return
    }

    if (text.length > MAX_SELECTION_CHARS) {
      clearSelection()
      options.onTooLong()
      return
    }

    const offsets = getSelectionOffsets(container, range)
    if (!offsets) {
      clearDraft()
      return
    }

    if (hasAnnotationOverlap(options.annotations(), offsets.startOffset, offsets.endOffset)) {
      clearSelection()
      options.onOverlap()
      return
    }

    const plainText = container.textContent || ''
    const rect = range.getBoundingClientRect()
    const placement = rect.top > 110 ? 'top' : 'bottom'
    draft.value = {
      selectedText: text,
      prefix: plainText.slice(Math.max(0, offsets.startOffset - 80), offsets.startOffset),
      suffix: plainText.slice(offsets.endOffset, offsets.endOffset + 80),
      occurrenceIndex: countOccurrencesBefore(plainText, text, offsets.startOffset),
      startOffset: offsets.startOffset,
      endOffset: offsets.endOffset,
    }
    const half = 90
    toolbar.value = {
      visible: true,
      x: Math.min(Math.max(rect.left + rect.width / 2, half + 8), window.innerWidth - half - 8),
      y: placement === 'top' ? rect.top - 8 : rect.bottom + 8,
      placement,
    }
  }

  function onScroll() {
    // 滚动后浮条与选区位置错位，直接收起；需要时重新划词。
    if (toolbar.value.visible) {
      toolbar.value = { ...toolbar.value, visible: false }
      draft.value = null
    }
  }

  function attach() {
    globalThis.document.addEventListener('selectionchange', handleSelectionChange)
    // capture 捕获弹层内滚动；window scroll 覆盖正文滚动
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
  }

  function detach() {
    globalThis.document.removeEventListener('selectionchange', handleSelectionChange)
    window.removeEventListener('scroll', onScroll, { capture: true })
    if (debounceTimer !== undefined) window.clearTimeout(debounceTimer)
  }

  onBeforeUnmount(detach)

  return { draft, toolbar, clearDraft, clearSelection, attach, detach }
}
