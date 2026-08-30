const POSITIONS_KEY = 'lumi_reader_positions'
const MAX_ENTRIES = 50

type PositionMap = Record<string, number>

function readAll(): { map: PositionMap; order: string[] } {
  try {
    const raw = localStorage.getItem(POSITIONS_KEY)
    if (!raw) return { map: {}, order: [] }
    const parsed = JSON.parse(raw) as { map?: PositionMap; order?: string[] }
    return { map: parsed.map || {}, order: parsed.order || [] }
  } catch {
    return { map: {}, order: [] }
  }
}

function writeAll(map: PositionMap, order: string[]) {
  try {
    localStorage.setItem(POSITIONS_KEY, JSON.stringify({ map, order }))
  } catch {
    // 存储已满等异常直接放弃本次记录，不影响阅读。
  }
}

/**
 * 阅读位置记忆：每篇一条 scrollTop，LRU 上限 50 篇。
 * 只在滚过一屏后记录（loadReaderPosition 由调用方先判断），
 * 恢复时由阅读器在正文渲染完成后调用。
 */
export function loadReaderPosition(id: string): number {
  const { map } = readAll()
  const value = map[id]
  return typeof value === 'number' && value > 0 ? value : 0
}

export function saveReaderPosition(id: string, scrollTop: number): void {
  const { map, order } = readAll()
  map[id] = Math.round(scrollTop)
  const nextOrder = [...order.filter((item) => item !== id), id]
  while (nextOrder.length > MAX_ENTRIES) {
    const evicted = nextOrder.shift()
    if (evicted) delete map[evicted]
  }
  writeAll(map, nextOrder)
}

export function clearReaderPosition(id: string): void {
  const { map, order } = readAll()
  if (!(id in map)) return
  delete map[id]
  writeAll(map, order.filter((item) => item !== id))
}
