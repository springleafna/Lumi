export type PaginationItem = number | 'ellipsis'

/**
 * 生成页码序列：总页数不超过 7 页时全部展示；
 * 否则固定包含首尾页，展示当前页 ±1，间隙用省略号占位。
 */
export function buildPaginationItems(current: number, totalPages: number): PaginationItem[] {
  const pages = Math.max(1, Math.floor(totalPages))
  if (pages <= 7) {
    return Array.from({ length: pages }, (_, index) => index + 1)
  }

  const safeCurrent = Math.min(Math.max(1, current), pages)
  const windowStart = Math.max(2, safeCurrent - 1)
  const windowEnd = Math.min(pages - 1, safeCurrent + 1)
  const items: PaginationItem[] = [1]

  if (windowStart > 2) {
    items.push('ellipsis')
  }
  for (let page = windowStart; page <= windowEnd; page += 1) {
    items.push(page)
  }
  if (windowEnd < pages - 1) {
    items.push('ellipsis')
  }
  items.push(pages)
  return items
}
