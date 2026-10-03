<template>
  <section class="page" data-module="emergencyrepair">
    <header class="page-head">
      <div>
        <h2>抢修处置管理</h2>
        <p class="page-desc">维护抢修记录，围绕抢修编号、故障管段、故障类型、影响面积做登记、筛选与状态流转；隐患销号结果先进入下方待复核清单。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记抢修记录</button>
        <button class="btn" type="button" @click="exportRows">导出抢修处置清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <h3 class="section-title review-title">
      隐患销号待复核清单
      <span class="review-count">{{ reviewRows.length }}</span>
    </h3>
    <table class="data-table review-table">
      <thead>
        <tr>
          <th>抢修编号</th>
          <th>来源隐患编号</th>
          <th>隐患点位置</th>
          <th>故障管段</th>
          <th>销号日期</th>
          <th>恢复时间</th>
          <th>复核状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in reviewRows" :key="`review-${String(row.id)}`">
          <td>{{ row['抢修编号'] }}</td>
          <td>{{ row['来源隐患编号'] }}</td>
          <td>{{ row['隐患点位置'] }}</td>
          <td>{{ row['故障管段'] }}</td>
          <td>{{ row['销号日期'] }}</td>
          <td>{{ row['恢复时间'] }}</td>
          <td><span class="tag tag-review">{{ row['复核状态'] ?? '待复核' }}</span></td>
          <td class="row-actions">
            <button class="link" type="button" @click="passReview(row)">复核通过</button>
          </td>
        </tr>
        <tr v-if="!reviewRows.length">
          <td colspan="8" class="empty-state">暂无隐患销号待复核记录</td>
        </tr>
      </tbody>
    </table>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无抢修处置数据，可先登记抢修记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条抢修处置记录（待复核单在上方清单单独管理）</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  filterRows,
  listEntries,
  moduleMeta,
  repairMainRows,
  repairReviewRows,
  reviewRepair,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('emergencyrepair')
const columns = ["抢修编号", "故障管段", "故障类型", "影响面积", "抢修队", "到场时间", "恢复时间", "抢修状态"]
const actions = ["派出抢修", "确认恢复", "上报升级"]
const statuses = ["待派修", "抢修中", "已恢复", "已升级"]

const rows = ref<EntryRow[]>([])
const reviewRows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

const stats = computed(() => [
  { label: "待派修故障", value: rows.value.filter((row) => String(row.status) === "待派修").length },
  { label: "抢修中故障", value: rows.value.filter((row) => String(row.status) === "抢修中").length },
  { label: "销号待复核", value: reviewRows.value.length },
])

function passReview(row: EntryRow) {
  errorMessage.value = ''
  const result = reviewRepair(Number(row.id), '现场复核合格')
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '抢修记录登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    // 主清单走通用筛选，待复核单单独在上方清单展示，不混进主表。
    rows.value = filterRows(repairMainRows(), filters.value)
    reviewRows.value = repairReviewRows()
    total.value = listEntries(meta.key).total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '抢修处置列表读取失败'
  }
}

onMounted(reload)
</script>
