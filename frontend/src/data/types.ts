/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
  // 状态按 statuses 顺序一档一档往下走：只允许走到当前状态的下一档，跨档/回退一律挡回。
  linearFlow?: boolean
  // 登记新记录时的必填字段；首个字段同时作为去重口径，重复提交按第一次认。
  createRequired?: string[]
  // 新记录编号前缀，缺省走模块字段名缩写。
  codePrefix?: string
  // 线性流转命中某动作时同步维护的字段：风险分级、督办轮次。
  gradeField?: string
  roundField?: string
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}
