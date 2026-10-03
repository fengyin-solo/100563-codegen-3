import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

// 管网隐患点沿用既有红橙黄蓝四级风险分级口径：挂号按定级入册，之后一级到四级一档一档往下推。
const HAZARD_KEY = 'pipehazard'
const HAZARD_GRADE_STATUS: Record<string, string> = {
  一级: '一级管控',
  二级: '二级管控',
  三级: '三级管控',
  四级: '四级管控',
}

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

// 隐患销号结果同步到抢修处置：补一条「待复核」记录，抢修页的待复核清单直接读它。
function appendRepairReview(key: string, hazard: EntryRow): void {
  const rows = listRows(key)
  const id = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const closedDate = String(hazard.销号日期 ?? '')
  const review: EntryRow = {
    id,
    status: '已恢复',
    pending: true,
    abnormal: false,
    抢修编号: `REVIEW-${String(hazard.隐患编号 ?? id)}`,
    故障管段: String(hazard.所属管段 ?? ''),
    故障类型: '隐患销号复核',
    影响面积: '—',
    抢修队: String(hazard.督办整改人 ?? ''),
    到场时间: closedDate,
    恢复时间: closedDate,
    抢修状态: '待复核',
  }
  saveRows(key, [...rows, review])
}

export function createEntry(key: string, fields: Record<string, string>): ActionResult {
  const meta = moduleMeta(key)
  const rows = listRows(key)
  const dedupFields = meta.dedupFields ?? []
  for (const field of dedupFields) {
    if (!String(fields[field] ?? '').trim()) {
      return { ok: false, message: `${field}不能为空，${meta.entity}挂号不予受理` }
    }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  if (dedupFields.length > 0) {
    const duplicated = rows.find(
      (row) =>
        String(row.status) !== lastStatus &&
        dedupFields.every(
          (field) => String(row[field] ?? '').trim() === String(fields[field] ?? '').trim(),
        ),
    )
    if (duplicated) {
      const code = meta.codeField ? String(duplicated[meta.codeField] ?? '') : ''
      return {
        ok: false,
        message: `该${meta.entity}已挂号在册（${code || `编号${duplicated.id}`}，当前「${duplicated.status}」），重复提交按首次挂号认定`,
      }
    }
  }
  const id = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const record: EntryRow = {
    id,
    status: meta.statuses[0],
    pending: true,
    abnormal: false,
    ...fields,
  }
  if (key === HAZARD_KEY) {
    record.status = HAZARD_GRADE_STATUS[String(fields.风险分级 ?? '').trim()] ?? meta.statuses[0]
    record.督办轮次 = Number(fields.督办轮次) || 1
    record.销号日期 = String(fields.销号日期 ?? '')
  }
  if (meta.codeField && meta.codePrefix) {
    record[meta.codeField] = `${meta.codePrefix}-${String(id).padStart(4, '0')}`
  }
  saveRows(key, [...rows, record])
  const code = meta.codeField ? String(record[meta.codeField]) : `编号${id}`
  return { ok: true, message: `${meta.entity}已挂号（${code}），当前状态「${record.status}」` }
}

export function runAction(
  key: string,
  id: number,
  action: string,
  extra: Record<string, string> = {},
): ActionResult {
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
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  if (meta.stepwise) {
    const currentIndex = meta.statuses.indexOf(current)
    const targetIndex = meta.statuses.indexOf(target)
    if (currentIndex < 0 || targetIndex !== currentIndex + 1) {
      return {
        ok: false,
        message: `${meta.entity}挂号后须按分级一档一档往下推，跨级处置一律挡回（当前「${current}」，不能直接转为「${target}」）`,
      }
    }
  }
  const requiredFields = meta.actionFields?.[action] ?? []
  for (const field of requiredFields) {
    if (!String(extra[field] ?? '').trim()) {
      return { ok: false, message: `${field}缺失，${meta.entity}${action}不予受理` }
    }
  }
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  for (const field of requiredFields) {
    updated[field] = String(extra[field]).trim()
  }
  if (meta.stepwise && target !== lastStatus && '督办轮次' in updated) {
    updated.督办轮次 = (Number(updated.督办轮次) || 0) + 1
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  let message = `${meta.entity}已${action}，当前状态「${target}」`
  if (meta.reviewFeed && target === lastStatus) {
    appendRepairReview(meta.reviewFeed, updated)
    message += '，结果已推送抢修处置待复核清单'
  }
  return { ok: true, message }
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
