<template>
  <section class="page" data-module="pipehazard">
    <header class="page-head">
      <div>
        <h2>管网隐患点分级管控台账</h2>
        <p class="page-desc">
          {{ meta.desc }}分级口径沿用红橙黄蓝四级：一级（红·重大）、二级（橙·较大）、三级（黄·一般）、四级（蓝·低）。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="registerOpen = !registerOpen">隐患挂号</button>
        <button class="btn" type="button" @click="exportRows">导出隐患台账</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <form v-if="registerOpen" class="register-bar" @submit.prevent="submitRegister">
      <label class="filter-item">
        <span>隐患点位置</span>
        <input v-model="draft.隐患点位置" required placeholder="如：和平路与建设大街交口" />
      </label>
      <label class="filter-item">
        <span>所属管段</span>
        <input v-model="draft.所属管段" required placeholder="如：PRIM-0002" />
      </label>
      <label class="filter-item">
        <span>风险分级</span>
        <select v-model="draft.风险分级">
          <option v-for="grade in GRADES" :key="grade.grade" :value="grade.grade">
            {{ grade.grade }}（{{ grade.tag }}）
          </option>
        </select>
      </label>
      <label class="filter-item">
        <span>督办整改人</span>
        <input v-model="draft.督办整改人" required placeholder="整改责任人" />
      </label>
      <label class="filter-item">
        <span>督办期限</span>
        <input v-model="draft.督办期限" required type="date" />
      </label>
      <button class="btn primary" type="submit">提交挂号</button>
      <span class="form-hint">重复提交按首次挂号认定</span>
    </form>

    <p class="tab-row">
      <button class="btn" type="button" :class="{ primary: tab === 'board' }" @click="tab = 'board'">分级台账</button>
      <button class="btn" type="button" :class="{ primary: tab === 'close' }" @click="tab = 'close'">销号页</button>
    </p>

    <div v-if="tab === 'board'" class="board-row">
      <section
        v-for="column in boardColumns"
        :key="column.key"
        class="board-col"
        :class="`tone-${column.tone}`"
      >
        <h3>{{ column.title }}（{{ column.rows.length }}）</h3>
        <article v-for="row in column.rows" :key="String(row.id)" class="hazard-card">
          <p class="card-line">
            <span class="k">隐患编号</span>
            <span>{{ row['隐患编号'] }}</span>
          </p>
          <p class="card-line">
            <span class="k">隐患点位置</span>
            <span>{{ row['隐患点位置'] }}</span>
          </p>
          <p class="card-line">
            <span class="k">所属管段</span>
            <span>{{ row['所属管段'] }}</span>
          </p>
          <p class="card-line">
            <span class="k">督办整改人</span>
            <span>{{ row['督办整改人'] }}</span>
          </p>
          <p class="card-line">
            <span class="k">风险分级</span>
            <span>{{ row['风险分级'] }}</span>
          </p>
          <p class="card-line">
            <span class="k">当前档位</span>
            <span class="grade-badge" :class="`tone-${gradeTone(String(row.status))}`">{{ row.status }}</span>
          </p>
          <p class="card-line">
            <span class="k">督办期限</span>
            <span :class="{ 'error-text': isOverdue(row) }">{{ row['督办期限'] || '—' }}</span>
          </p>
          <p class="card-line">
            <span class="k">督办轮次</span>
            <span>第 {{ row['督办轮次'] }} 轮</span>
          </p>
          <p class="card-line">
            <span class="k">销号日期</span>
            <span>{{ row['销号日期'] || '—' }}</span>
          </p>
          <p class="card-actions">
            <button
              v-if="demoteAction(row)"
              class="link"
              type="button"
              @click="runAction(demoteAction(row), row)"
            >
              {{ demoteAction(row) }}
            </button>
            <span v-else class="muted">已到最低档，请去销号页办理销号</span>
          </p>
        </article>
        <p v-if="!column.rows.length" class="empty-state">暂无记录</p>
      </section>
    </div>

    <div v-else class="close-panel">
      <h3 class="panel-title">待销号（四级管控在册，销号日期缺失的不予受理）</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>隐患编号</th>
            <th>隐患点位置</th>
            <th>所属管段</th>
            <th>督办整改人</th>
            <th>督办轮次</th>
            <th>销号日期</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in pendingCloseRows" :key="String(row.id)">
            <td>{{ row['隐患编号'] }}</td>
            <td>{{ row['隐患点位置'] }}</td>
            <td>{{ row['所属管段'] }}</td>
            <td>{{ row['督办整改人'] }}</td>
            <td>第 {{ row['督办轮次'] }} 轮</td>
            <td><input v-model="closeDates[String(row.id)]" type="date" /></td>
            <td>
              <button class="link" type="button" @click="confirmClose(row)">确认销号</button>
            </td>
          </tr>
          <tr v-if="!pendingCloseRows.length">
            <td colspan="7" class="empty-state">暂无待销号隐患点</td>
          </tr>
        </tbody>
      </table>

      <h3 class="panel-title">已销号</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>隐患编号</th>
            <th>隐患点位置</th>
            <th>所属管段</th>
            <th>督办整改人</th>
            <th>风险分级</th>
            <th>销号日期</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in closedRows" :key="String(row.id)">
            <td>{{ row['隐患编号'] }}</td>
            <td>{{ row['隐患点位置'] }}</td>
            <td>{{ row['所属管段'] }}</td>
            <td>{{ row['督办整改人'] }}</td>
            <td>{{ row['风险分级'] }}</td>
            <td>{{ row['销号日期'] || '—' }}</td>
          </tr>
          <tr v-if="!closedRows.length">
            <td colspan="6" class="empty-state">暂无已销号隐患点</td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer class="page-foot">
      <span>共 {{ total }} 条管网隐患点记录 · 分级台账与销号页同取一份数据</span>
      <span v-if="notice" :class="noticeOk ? 'ok-text' : 'error-text'">{{ notice }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  createEntry,
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('pipehazard')
const statuses = meta.statuses
const actions = meta.actions
const lastStatus = statuses[statuses.length - 1]

// 既有分级口径：红橙黄蓝四级风险分级，一级最重、四级最轻，销号在末档之后。
const GRADES = [
  { grade: '一级', status: '一级管控', tag: '红·重大', tone: 'red' },
  { grade: '二级', status: '二级管控', tag: '橙·较大', tone: 'orange' },
  { grade: '三级', status: '三级管控', tag: '黄·一般', tone: 'yellow' },
  { grade: '四级', status: '四级管控', tag: '蓝·低', tone: 'blue' },
]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const notice = ref('')
const noticeOk = ref(false)
const tab = ref<'board' | 'close'>('board')
const registerOpen = ref(false)
const draft = ref<Record<string, string>>({ 风险分级: '一级' })
const closeDates = ref<Record<string, string>>({})

function todayText(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function isOverdue(row: EntryRow): boolean {
  const deadline = String(row['督办期限'] ?? '')
  return deadline !== '' && deadline < todayText() && String(row.status) !== lastStatus
}

const overdueRows = computed(() => rows.value.filter(isOverdue))
const closedRows = computed(() => rows.value.filter((row) => String(row.status) === lastStatus))
const pendingCloseRows = computed(() =>
  rows.value.filter((row) => String(row.status) === GRADES[GRADES.length - 1].status),
)

const stats = computed(() => [
  { label: '在册隐患点', value: rows.value.filter((row) => String(row.status) !== lastStatus).length },
  { label: '已过督办期限', value: overdueRows.value.length },
  { label: '已销号', value: closedRows.value.length },
])

function gradeRows(status: string): EntryRow[] {
  return rows.value.filter((row) => String(row.status) === status && !isOverdue(row))
}

// 分栏：已过督办期限的单独排在最前一栏，其后按风险分级一档一栏。
const boardColumns = computed(() => [
  { key: 'overdue', title: '已过督办期限', tone: 'overdue', rows: overdueRows.value },
  ...GRADES.map((grade) => ({
    key: grade.status,
    title: `${grade.status}（${grade.tag}）`,
    tone: grade.tone,
    rows: gradeRows(grade.status),
  })),
])

function gradeTone(status: string): string {
  return GRADES.find((grade) => grade.status === status)?.tone ?? 'blue'
}

function demoteAction(row: EntryRow): string {
  const index = statuses.indexOf(String(row.status))
  const next = statuses[index + 1]
  if (!next || next === lastStatus) {
    return ''
  }
  return actions.find((action) => meta.actionTargets[action] === next) ?? ''
}

function submitRegister() {
  const result = createEntry(meta.key, { ...draft.value })
  notice.value = result.message
  noticeOk.value = result.ok
  if (result.ok) {
    draft.value = { 风险分级: draft.value.风险分级 }
    registerOpen.value = false
    reload()
  }
}

function confirmClose(row: EntryRow) {
  runAction('确认销号', row, { 销号日期: closeDates.value[String(row.id)] ?? '' })
}

function runAction(action: string, row: EntryRow, extra: Record<string, string> = {}) {
  const result = applyAction(meta.key, Number(row.id), action, extra)
  notice.value = result.message
  noticeOk.value = result.ok
  if (result.ok) {
    reload()
  }
}

function exportRows() {
  downloadEntries(meta.key)
}

function reload() {
  try {
    const payload = listEntries(meta.key)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '管网隐患点台账读取失败'
    noticeOk.value = false
  }
}

onMounted(reload)
</script>
