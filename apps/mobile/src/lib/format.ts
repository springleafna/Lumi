export function formatDate(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function formatWordCount(count?: number | null): string {
  return count ? `${count} 字` : ''
}
