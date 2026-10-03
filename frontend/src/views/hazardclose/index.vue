<template>
  <section class="page" data-module="hazardclose">
    <header class="page-head">
      <div>
        <h2>管网隐患点销号</h2>
        <p class="page-desc">
          与隐患分级管控台账取同一份数据。销号日期缺失或不真实的不予受理；销号结果同步进入抢修处置的待复核清单。
        </p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" :to="{ name: 'hazardledger' }">返回隐患台账</RouterLink>
        <RouterLink class="btn" :to="{ name: 'emergencyrepair' }">查看抢修待复核（{{ reviewCount }}）</RouterLink>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">待销号隐患</span>
        <strong class="stat-value">{{ pendingRows.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">已销号隐患</span>
        <strong class="stat-value">{{ closedRows.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">销号后待抢修复核</span>
        <strong class="stat-value">{{ reviewCount }}</strong>
      </article>
    </div>

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>关键字</span>
        <input v-model="keyword" placeholder="按位置 / 管段 / 整改人 / 编号检索" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="keyword = ''; reload()">重置条件</button>
    </form>

    <h3 class="section-title">待销号隐患（{{ pendingRows.length }}）</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th>隐患编号</th>
          <th>隐患点位置</th>
          <th>所属管段</th>
          <th>风险分级</th>
          <th>督办整改人</th>
          <th>督办轮次</th>
          <th>督办期限</th>
          <th>挂号日期</th>
          <th>销号日期</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in pendingRows" :key="String(row.id)" :class="{ 'row-overdue': isHazardOverdue(row) }">
          <td>{{ row['隐患编号'] }}</td>
          <td>{{ row['隐患点位置'] }}</td>
          <td>{{ row['所属管段'] }}</td>
          <td><span class="tag" :class="gradeTagClass(row)">{{ row['风险分级'] }}</span></td>
          <td>{{ row['督办整改人'] }}</td>
          <td>第 {{ row['督办轮次'] }} 轮</td>
          <td :class="{ 'text-danger': isHazardOverdue(row) }">{{ row['督办期限'] }}</td>
          <td>{{ row['挂号日期'] }}</td>
          <td><span class="muted">未销号</span></td>
          <td class="row-actions">
            <button class="link" type="button" @click="openClose(row)">办理销号</button>
          </td>
        </tr>
        <tr v-if="!pendingRows.length">
          <td colspan="10" class="empty-state">当前没有待销号的隐患点</td>
        </tr>
      </tbody>
    </table>

    <h3 class="section-title">已销号台账（{{ closedRows.length }}）</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th>隐患编号</th>
          <th>隐患点位置</th>
          <th>所属管段</th>
          <th>销号时分级</th>
          <th>督办整改人</th>
          <th>督办轮次</th>
          <th>挂号日期</th>
          <th>销号日期</th>
          <th>抢修复核</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in closedRows" :key="String(row.id)">
          <td>{{ row['隐患编号'] }}</td>
          <td>{{ row['隐患点位置'] }}</td>
          <td>{{ row['所属管段'] }}</td>
          <td><span class="tag" :class="gradeTagClass(row)">{{ row['风险分级'] }}</span></td>
          <td>{{ row['督办整改人'] }}</td>
          <td>第 {{ row['督办轮次'] }} 轮</td>
          <td>{{ row['挂号日期'] }}</td>
          <td><strong>{{ row['销号日期'] }}</strong></td>
          <td>
            <span v-if="reviewMap.get(String(row['隐患编号'])) === '待复核'" class="tag tag-review">待复核</span>
            <span v-else-if="reviewMap.get(String(row['隐患编号'])) === '已复核'" class="tag tag-done">已复核</span>
            <span v-else class="muted">—</span>
          </td>
        </tr>
        <tr v-if="!closedRows.length">
          <td colspan="9" class="empty-state">暂无已销号隐患</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>销号日期缺失的一律不予受理；重复销号按第一次销号结果认</span>
      <span v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</span>
    </footer>

    <div v-if="target" class="modal-mask" @click.self="target = null">
      <form class="modal-panel" @submit.prevent="submitClose">
        <header class="modal-head">
          <h3>隐患销号受理</h3>
          <button class="link" type="button" @click="target = null">关闭</button>
        </header>
        <dl class="close-summary">
          <div><dt>隐患编号</dt><dd>{{ target['隐患编号'] }}</dd></div>
          <div><dt>隐患点位置</dt><dd>{{ target['隐患点位置'] }}</dd></div>
          <div><dt>所属管段</dt><dd>{{ target['所属管段'] }}</dd></div>
          <div><dt>当前分级</dt><dd>{{ target['风险分级'] }}（第 {{ target['督办轮次'] }} 轮督办）</dd></div>
        </dl>
        <label class="form-item">
          <span>销号日期 <em>*</em></span>
          <input v-model="closeDate" type="date" required />
        </label>
        <p v-if="!closeDate" class="form-warn">未填销号日期的销号申请将不予受理。</p>
        <footer class="modal-foot">
          <button class="btn" type="button" @click="target = null">取消</button>
          <button class="btn primary" type="submit">受理销号</button>
        </footer>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  closeHazard,
  hazardRepairRows,
  hazardRows,
  isHazardOverdue,
  normalizeHazardGrade,
  repairReviewRows,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const keyword = ref('')
const rows = ref<EntryRow[]>([])
const message = ref('')
const messageOk = ref(false)

const target = ref<EntryRow | null>(null)
const closeDate = ref('')

const GRADE_TONE: Record<string, string> = {
  重大风险: 'major',
  较大风险: 'large',
  一般风险: 'general',
  低风险: 'low',
}
function gradeTagClass(row: EntryRow) {
  const grade = normalizeHazardGrade(row['风险分级'])
  return grade ? `tag-grade-${GRADE_TONE[grade]}` : 'tag-grade-other'
}

const pendingRows = computed(() =>
  rows.value
    .filter((row) => String(row.status) !== '已销号')
    .sort((a, b) => String(a['督办期限']).localeCompare(String(b['督办期限']))),
)
const closedRows = computed(() =>
  rows.value
    .filter((row) => String(row.status) === '已销号')
    .sort((a, b) => String(b['销号日期']).localeCompare(String(a['销号日期']))),
)

// 抢修待复核清单与本页共用本地数据层：按隐患编号回填复核状态。
const reviewMap = computed(() => {
  const map = new Map<string, string>()
  for (const repair of hazardRepairRows()) {
    map.set(String(repair['来源隐患编号']), String(repair['复核状态'] ?? '待复核'))
  }
  return map
})
const reviewCount = computed(() => repairReviewRows().length)

function openClose(row: EntryRow) {
  target.value = row
  closeDate.value = new Date().toISOString().slice(0, 10)
  message.value = ''
}

function submitClose() {
  if (!target.value) {
    return
  }
  const result = closeHazard(Number(target.value.id), closeDate.value)
  messageOk.value = result.ok
  message.value = result.message
  if (!result.ok) {
    return
  }
  target.value = null
  reload()
}

function reload() {
  rows.value = hazardRows(keyword.value)
  message.value = ''
}

onMounted(reload)
</script>
