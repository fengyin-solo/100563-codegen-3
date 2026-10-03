// 日期工具：台账里督办期限、挂号/销号日期统一用 YYYY-MM-DD，便于直接按字符串比较先后。

function toDayStart(base: Date = new Date()): Date {
  const day = new Date(base.getTime())
  day.setHours(0, 0, 0, 0)
  return day
}

export function isoToday(base: Date = new Date()): string {
  return formatDate(toDayStart(base))
}

// 相对今天偏移若干天的日期字符串：示例数据靠它保证「已逾期/未到期」随打开日期稳定呈现。
export function isoOffsetDate(days: number, base: Date = new Date()): string {
  const day = toDayStart(base)
  day.setDate(day.getDate() + days)
  return formatDate(day)
}

export function formatDate(day: Date): string {
  const year = day.getFullYear()
  const month = String(day.getMonth() + 1).padStart(2, '0')
  const date = String(day.getDate()).padStart(2, '0')
  return `${year}-${month}-${date}`
}

// 严格校验 YYYY-MM-DD 且是真实日期（挡住 2026-02-30 这类）。
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  const [year, month, date] = value.split('-').map(Number)
  const parsed = new Date(year, month - 1, date)
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === date
  )
}
