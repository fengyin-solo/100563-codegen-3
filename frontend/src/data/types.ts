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
  /** 逐级流转：为 true 时动作目标必须是当前状态的下一档，跨级处置一律挡回 */
  stepwise?: boolean
  /** 挂号去重键：这些字段完全一致且尚未闭环时，重复提交按首次挂号认定 */
  dedupFields?: string[]
  /** 动作前置字段：执行动作时必须随单提交，缺失的不予受理 */
  actionFields?: Record<string, string[]>
  /** 编号字段与前缀：挂号时按「前缀-序号」自动生成 */
  codeField?: string
  codePrefix?: string
  /** 闭环联动：走到末态时把结果推一份到指定模块的待复核清单 */
  reviewFeed?: string
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
