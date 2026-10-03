<template>
  <section class="page" data-module="hazardledger">
    <header class="page-head">
      <div>
        <h2>管网隐患点分级管控台账</h2>
        <p class="page-desc">
          沿用既有重大、较大、一般、低四档风险分级口径；已过督办期限的单独提到最前一栏。挂号后按分级一档一档往下督办，跨级处置一律挡回。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">隐患挂号</button>
        <RouterLink class="btn" :to="{ name: 'hazardclose' }">前往销号页</RouterLink>
        <button class="btn" type="button" @click="exportRows">导出台账清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">未销号隐患</span>
        <strong class="stat-value">{{ stats.active }}</strong>
      </article>
      <article class="stat-card stat-danger">
        <span class="stat-label">已过督办期限</span>
        <strong class="stat-value">{{ stats.overdue }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">已销号隐患</span>
        <strong class="stat-value">{{ stats.closed }}</strong>
      </article>
    </div>

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>关键字</span>
        <input v-model="keyword" placeholder="按位置 / 管段 / 整改人 / 编号检索" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <div class="kanban">
      <section v-for="column in columns" :key="column.key" class="kanban-col" :class="`tone-${column.tone}`">
        <header class="kanban-head">
          <span class="kanban-dot" />
          <strong>{{ column.title }}</strong>
          <span class="kanban-count">{{ column.items.length }}</span>
        </header>
        <p v-if="!column.items.length" class="kanban-empty">本栏暂无隐患点</p>
        <article v-for="row in column.items" :key="String(row.id)" class="hazard-card">
          <div class="hazard-card-top">
            <span class="hazard-code">{{ row['隐患编号'] }}</span>
            <span v-if="isClosed(row)" class="tag tag-closed">已销号</span>
            <span v-else-if="isOverdue(row)" class="tag tag-overdue">已逾期</span>
            <span v-else class="tag" :class="gradeTagClass(row)">在管</span>
          </div>
          <h3 class="hazard-location">{{ row['隐患点位置'] }}</h3>
          <dl class="hazard-meta">
            <div><dt>所属管段</dt><dd>{{ row['所属管段'] }}</dd></div>
            <div><dt>督办整改人</dt><dd>{{ row['督办整改人'] }}</dd></div>
            <div><dt>督办轮次</dt><dd>第 {{ row['督办轮次'] }} 轮</dd></div>
            <div><dt>督办期限</dt><dd :class="{ 'text-danger': isOverdue(row) }">{{ row['督办期限'] }}</dd></div>
            <div><dt>挂号日期</dt><dd>{{ row['挂号日期'] }}</dd></div>
            <div class="hazard-close-row"><dt>销号日期</dt><dd>{{ row['销号日期'] || '—' }}</dd></div>
          </dl>
          <footer v-if="!isClosed(row)" class="hazard-actions">
            <button v-if="nextAction(row)" class="link" type="button" @click="promote(row)">
              {{ nextAction(row) }}
            </button>
            <RouterLink class="link" :to="{ name: 'hazardclose' }">去销号</RouterLink>
          </footer>
        </article>
      </section>
    </div>

    <footer class="page-foot">
      <span>共 {{ total }} 个管网隐患点；台账与销号页取同一份数据</span>
      <span v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</span>
    </footer>

    <div v-if="creating" class="modal-mask" @click.self="creating = false">
      <form class="modal-panel" @submit.prevent="submitCreate">
        <header class="modal-head">
          <h3>隐患挂号</h3>
          <button class="link" type="button" @click="creating = false">关闭</button>
        </header>
        <p class="modal-tip">挂号统一按「重大风险（红）」起步，之后只能一档一档往下督办；同一隐患点重复挂号按第一次认。</p>
        <label class="form-item">
          <span>隐患点位置 <em>*</em></span>
          <input v-model="form['隐患点位置']" placeholder="如：和平路与解放大街交叉口南 120m" />
        </label>
        <label class="form-item">
          <span>所属管段 <em>*</em></span>
          <input v-model="form['所属管段']" placeholder="如：DN300 一次网和平路干线（和-03 至和-05）" />
        </label>
        <label class="form-item">
          <span>督办整改人 <em>*</em></span>
          <input v-model="form['督办整改人']" placeholder="如：王建国" />
        </label>
        <label class="form-item">
          <span>本轮督办期限 <em>*</em></span>
          <input v-model="form['督办期限']" type="date" />
        </label>
        <label class="form-item">
          <span>隐患来源</span>
          <select v-model="form['隐患来源']">
            <option value="">请选择（巡检本 / 探漏单）</option>
            <option value="巡检本">巡检本</option>
            <option value="探漏单">探漏单</option>
          </select>
        </label>
        <label class="form-item">
          <span>隐患描述</span>
          <textarea v-model="form['隐患描述']" rows="2" placeholder="现场情况、漏量、处置建议等" />
        </label>
        <footer class="modal-foot">
          <button class="btn" type="button" @click="creating = false">取消</button>
          <button class="btn primary" type="submit">提交挂号</button>
        </footer>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'

import {
  downloadEntries,
  hazardColumns,
  hazardStats,
  isHazardOverdue,
  listEntries,
  moduleMeta,
  normalizeHazardGrade,
  registerHazard,
  runAction as applyAction,
} from '@/api/local-service'
import type { HazardColumn } from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('hazardledger')

const keyword = ref('')
const columns = ref<HazardColumn[]>([])
const total = ref(0)
const stats = ref({ active: 0, overdue: 0, closed: 0 })
const message = ref('')
const messageOk = ref(false)

const creating = ref(false)
const emptyForm = () => ({
  隐患点位置: '',
  所属管段: '',
  督办整改人: '',
  督办期限: '',
  隐患来源: '',
  隐患描述: '',
})
const form = reactive(emptyForm())

const gradeTagClass = (row: EntryRow) => {
  const grade = normalizeHazardGrade(row['风险分级'])
  return grade ? `tag-grade-${HAZARD_TAG[grade]}` : 'tag-grade-other'
}
const HAZARD_TAG: Record<string, string> = {
  重大风险: 'major',
  较大风险: 'large',
  一般风险: 'general',
  低风险: 'low',
}

const isClosed = (row: EntryRow) => String(row.status) === '已销号'
const isOverdue = (row: EntryRow) => isHazardOverdue(row)

// 页面只展示紧邻的下一档动作；即使绕过页面，服务端也会把跨级处置挡回。
function nextAction(row: EntryRow): string {
  const grade = normalizeHazardGrade(row['风险分级'])
  if (grade === '重大风险') return '督办降为较大'
  if (grade === '较大风险') return '督办降为一般'
  if (grade === '一般风险') return '督办降为低风险'
  return ''
}

function notify(ok: boolean, text: string) {
  messageOk.value = ok
  message.value = text
}

function promote(row: EntryRow) {
  const action = nextAction(row)
  if (!action) {
    return
  }
  const result = applyAction(meta.key, Number(row.id), action)
  notify(result.ok, result.message)
  if (result.ok) {
    reload()
  }
}

function openCreate() {
  Object.assign(form, emptyForm())
  message.value = ''
  creating.value = true
}

function submitCreate() {
  const result = registerHazard({ ...form })
  notify(result.ok, result.message)
  if (!result.ok) {
    return
  }
  creating.value = false
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function resetFilters() {
  keyword.value = ''
  reload()
}

function reload() {
  message.value = ''
  columns.value = hazardColumns(keyword.value)
  total.value = listEntries(meta.key).total
  stats.value = hazardStats()
}

onMounted(reload)
</script>
