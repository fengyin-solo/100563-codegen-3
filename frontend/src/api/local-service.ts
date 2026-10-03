import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'
import { isValidIsoDate, isoToday } from '@/data/date'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  // 线性流转（隐患分级管控）：只允许从当前档走到紧邻的下一档，跨级、回退、对终态操作一律挡回。
  if (meta.linearFlow) {
    const currentIndex = meta.statuses.indexOf(current)
    const targetIndex = meta.statuses.indexOf(target)
    if (currentIndex < 0) {
      return { ok: false, message: `当前分级「${current}」不在既有分级口径内，不能直接处置` }
    }
    if (currentIndex === meta.statuses.length - 1) {
      return { ok: false, message: `该${meta.entity}已销号，不能再做督办降级，如需处理请到抢修处置待复核清单` }
    }
    if (targetIndex !== currentIndex + 1) {
      return { ok: false, message: `当前为「${current}」，只能降为「${meta.statuses[currentIndex + 1]}」，跨级处置一律挡回` }
    }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  // 隐患降级时同步分级口径与督办轮次：每成功往下推一档，督办到下一轮。
  if (meta.linearFlow && meta.gradeField) {
    updated[meta.gradeField] = target
  }
  if (meta.linearFlow && meta.roundField) {
    updated[meta.roundField] = Number(rows[index][meta.roundField] ?? 0) + 1
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}

// ---------------------------------------------------------------------------
// 管网隐患点分级管控：台账页与销号页共用下面同一份数据与同一套判断。
// ---------------------------------------------------------------------------

export const HAZARD_KEY = 'hazardledger'
export const EMERGENCY_KEY = 'emergencyrepair'
export const HAZARD_CLOSED_STATUS = '已销号'

// 沿用既有分级口径：红橙黄蓝四色风险，兼容历史台账里的等价写法。
export const HAZARD_GRADES = ['重大风险', '较大风险', '一般风险', '低风险'] as const
export type HazardGrade = (typeof HAZARD_GRADES)[number]

const HAZARD_GRADE_ALIASES: Record<HazardGrade, string[]> = {
  重大风险: ['重大', '红色', '红', '一级', 'Ⅰ', 'I'],
  较大风险: ['较大', '橙色', '橙', '二级', 'Ⅱ', 'II'],
  一般风险: ['一般', '黄色', '黄', '三级', 'Ⅲ', 'III'],
  低风险: ['低', '蓝色', '蓝', '四级', 'Ⅳ', 'IV'],
}

// 把既有各种分级写法归一到四档口径；认不出来的归 null，单列一栏不丢数据。
export function normalizeHazardGrade(raw: unknown): HazardGrade | null {
  const value = String(raw ?? '').trim()
  if (!value) {
    return null
  }
  const exact = HAZARD_GRADES.find((grade) => value === grade)
  if (exact) {
    return exact
  }
  for (const grade of HAZARD_GRADES) {
    if (HAZARD_GRADE_ALIASES[grade].some((alias) => value.includes(alias))) {
      return grade
    }
  }
  return null
}

export function hazardRows(keyword = ''): EntryRow[] {
  const word = keyword.trim()
  const rows = listRows(HAZARD_KEY)
  if (!word) {
    return rows
  }
  const searchFields = ['隐患编号', '隐患点位置', '所属管段', '督办整改人', '风险分级', '隐患来源']
  return rows.filter((row) =>
    searchFields.some((field) => String(row[field] ?? '').includes(word)),
  )
}

export function isHazardOverdue(row: EntryRow, today: string = isoToday()): boolean {
  if (String(row.status) === HAZARD_CLOSED_STATUS) {
    return false
  }
  const deadline = String(row['督办期限'] ?? '').trim()
  return deadline !== '' && deadline < today
}

export type HazardColumn = {
  key: string
  title: string
  tone: 'overdue' | 'major' | 'large' | 'general' | 'low' | 'other'
  items: EntryRow[]
}

// 台账分栏：已过督办期限的未销号点单独提到最前一栏，其后按既有四档分级排，认不出口径的放最后一栏。
// 已销号点回到各自分级栏，并带上销号日期。
export function hazardColumns(keyword = '', today: string = isoToday()): HazardColumn[] {
  const rows = hazardRows(keyword)
  const active = rows.filter((row) => String(row.status) !== HAZARD_CLOSED_STATUS)
  const closed = rows.filter((row) => String(row.status) === HAZARD_CLOSED_STATUS)

  const sortByDeadline = (a: EntryRow, b: EntryRow) =>
    String(a['督办期限'] ?? '').localeCompare(String(b['督办期限'] ?? ''))

  const byGrade = (grade: HazardGrade, source: EntryRow[]) =>
    source.filter((row) => normalizeHazardGrade(row['风险分级']) === grade)

  const grades: { grade: HazardGrade; tone: HazardColumn['tone']; title: string }[] = [
    { grade: '重大风险', tone: 'major', title: '重大风险（红）' },
    { grade: '较大风险', tone: 'large', title: '较大风险（橙）' },
    { grade: '一般风险', tone: 'general', title: '一般风险（黄）' },
    { grade: '低风险', tone: 'low', title: '低风险（蓝）' },
  ]

  const columns: HazardColumn[] = [
    {
      key: 'overdue',
      title: '已过督办期限',
      tone: 'overdue',
      items: active.filter((row) => isHazardOverdue(row, today)).sort(sortByDeadline),
    },
  ]
  for (const { grade, tone, title } of grades) {
    const gradeActive = byGrade(grade, active).filter((row) => !isHazardOverdue(row, today))
    const gradeClosed = byGrade(grade, closed)
    columns.push({
      key: grade,
      title,
      tone,
      items: [...gradeActive.sort(sortByDeadline), ...gradeClosed.sort(sortByDeadline)],
    })
  }
  const otherActive = active.filter(
    (row) => normalizeHazardGrade(row['风险分级']) === null && !isHazardOverdue(row, today),
  )
  const otherClosed = closed.filter((row) => normalizeHazardGrade(row['风险分级']) === null)
  columns.push({
    key: 'other',
    title: '其他分级口径',
    tone: 'other',
    items: [...otherActive.sort(sortByDeadline), ...otherClosed.sort(sortByDeadline)],
  })
  return columns
}

export function hazardStats(today: string = isoToday()): {
  active: number
  overdue: number
  closed: number
} {
  const rows = listRows(HAZARD_KEY)
  const active = rows.filter((row) => String(row.status) !== HAZARD_CLOSED_STATUS)
  return {
    active: active.length,
    overdue: active.filter((row) => isHazardOverdue(row, today)).length,
    closed: rows.length - active.length,
  }
}

function nextCode(rows: EntryRow[], prefix: string, codeField: string): string {
  let max = 0
  for (const row of rows) {
    const matched = String(row[codeField] ?? '').match(/(\d+)\s*$/)
    if (matched) {
      max = Math.max(max, Number(matched[1]))
    }
  }
  // 自增跨隐患表与抢修表：抢修单沿用 EMER 口径，避免销号生成的待复核单与既有编号冲突。
  return `${prefix}-${String(max + 1).padStart(4, '0')}`
}

export type HazardDraft = {
  隐患点位置: string
  所属管段: string
  督办整改人: string
  督办期限: string
  隐患来源?: string
  隐患描述?: string
}

// 隐患挂号：统一挂重大风险（红）起步，之后只能一档一档往下督办。
// 重复提交（同一隐患点位置已在未销号台账里）按第一次认，直接挡回。
export function registerHazard(draft: HazardDraft): ActionResult & { id?: number } {
  const meta = moduleMeta(HAZARD_KEY)
  const required = meta.createRequired ?? []
  for (const field of required) {
    if (String(draft[field as keyof HazardDraft] ?? '').trim() === '') {
      return { ok: false, message: `「${field}」为必填项，不能空着挂号` }
    }
  }
  if (!isValidIsoDate(draft.督办期限.trim())) {
    return { ok: false, message: '督办期限须为真实日期，格式 YYYY-MM-DD' }
  }
  const rows = listRows(HAZARD_KEY)
  const duplicate = rows.find(
    (row) =>
      String(row.status) !== HAZARD_CLOSED_STATUS &&
      String(row['隐患点位置'] ?? '').trim() === draft.隐患点位置.trim(),
  )
  if (duplicate) {
    return {
      ok: false,
      message: `该隐患点已挂号（${duplicate['隐患编号']}，当前${duplicate['风险分级']}），重复提交按第一次认`,
    }
  }
  const code = nextCode(rows, meta.codePrefix ?? 'HAZ', '隐患编号')
  const today = isoToday()
  const row: EntryRow = {
    id: rows.reduce((max, item) => Math.max(max, Number(item.id)), 0) + 1,
    status: HAZARD_GRADES[0],
    pending: true,
    abnormal: false,
    隐患编号: code,
    隐患点位置: draft.隐患点位置.trim(),
    所属管段: draft.所属管段.trim(),
    风险分级: HAZARD_GRADES[0],
    督办整改人: draft.督办整改人.trim(),
    督办轮次: 0,
    督办期限: draft.督办期限.trim(),
    挂号日期: today,
    销号日期: '',
    隐患来源: draft.隐患来源?.trim() ?? '',
    隐患描述: draft.隐患描述?.trim() ?? '',
  }
  saveRows(HAZARD_KEY, [...rows, row])
  return { ok: true, message: `隐患点已挂号，编号 ${code}，统一按「${HAZARD_GRADES[0]}」起步管控`, id: Number(row.id) }
}

// 销号受理：销号日期缺失或不是真实日期的不予受理；销号后该点进抢修处置待复核清单。
export function closeHazard(id: number, closeDateRaw: string): ActionResult {
  const rows = listRows(HAZARD_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的管网隐患点` }
  }
  const current = rows[index]
  if (String(current.status) === HAZARD_CLOSED_STATUS) {
    return { ok: false, message: `隐患点 ${current['隐患编号']} 已于 ${current['销号日期']} 销号，不能重复销号` }
  }
  const closeDate = String(closeDateRaw ?? '').trim()
  if (!closeDate) {
    return { ok: false, message: '销号日期缺失，不予受理' }
  }
  if (!isValidIsoDate(closeDate)) {
    return { ok: false, message: '销号日期须为真实日期（YYYY-MM-DD），不予受理' }
  }

  const updated: EntryRow = {
    ...current,
    status: HAZARD_CLOSED_STATUS,
    pending: false,
    abnormal: false,
    销号日期: closeDate,
  }
  saveRows(HAZARD_KEY, [...rows.slice(0, index), updated, ...rows.slice(index + 1)])

  // 销号结果反映到抢修处置的待复核清单：同一隐患只生成一张待复核单。
  const repairs = listRows(EMERGENCY_KEY)
  const existed = repairs.some((row) => String(row['来源隐患编号'] ?? '') === String(current['隐患编号']))
  if (!existed) {
    const repair: EntryRow = {
      id: repairs.reduce((max, item) => Math.max(max, Number(item.id)), 0) + 1,
      status: '已恢复',
      pending: true,
      abnormal: false,
      抢修编号: nextCode(repairs, 'EMER', '抢修编号'),
      故障管段: String(current['所属管段'] ?? ''),
      故障类型: '隐患销号待复核',
      影响面积: '',
      抢修队: '',
      到场时间: '',
      恢复时间: closeDate,
      抢修状态: '已恢复',
      来源隐患编号: current['隐患编号'],
      隐患点位置: current['隐患点位置'],
      销号日期: closeDate,
      复核状态: '待复核',
    }
    saveRows(EMERGENCY_KEY, [...repairs, repair])
  }
  return { ok: true, message: `隐患点 ${current['隐患编号']} 已销号（${closeDate}），已进入抢修处置待复核清单` }
}

// 抢修处置待复核清单：只收隐患销号转来、复核状态仍为待复核的记录。
export function repairReviewRows(): EntryRow[] {
  return listRows(EMERGENCY_KEY).filter(
    (row) =>
      String(row['来源隐患编号'] ?? '') !== '' && String(row['复核状态'] ?? '待复核') === '待复核',
  )
}

// 抢修处置主清单不重复展示待复核单。
export function repairMainRows(): EntryRow[] {
  return listRows(EMERGENCY_KEY).filter(
    (row) => !(String(row['来源隐患编号'] ?? '') !== '' && String(row['复核状态'] ?? '待复核') === '待复核'),
  )
}

// 隐患销号转来的全部抢修单（含待复核、已复核），销号页据此回填复核状态。
export function hazardRepairRows(): EntryRow[] {
  return listRows(EMERGENCY_KEY).filter((row) => String(row['来源隐患编号'] ?? '') !== '')
}

export function reviewRepair(id: number, opinion: string): ActionResult {
  const rows = listRows(EMERGENCY_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的抢修记录` }
  }
  const current = rows[index]
  if (String(current['复核状态'] ?? '') === '已复核') {
    return { ok: false, message: `抢修单 ${current['抢修编号']} 已复核，不用重复操作` }
  }
  const updated: EntryRow = {
    ...current,
    pending: false,
    复核状态: '已复核',
    复核意见: opinion.trim() || '现场复核合格',
    复核日期: isoToday(),
  }
  saveRows(EMERGENCY_KEY, [...rows.slice(0, index), updated, ...rows.slice(index + 1)])
  return { ok: true, message: `抢修单 ${current['抢修编号']}（隐患 ${current['来源隐患编号']}）复核通过，已移出待复核清单` }
}
