// 用 vitest 之外的轻量断言跑一遍隐患台账的关键规则：在 Node 里用 esbuild 即时加载 TS。
import { registerHazard, closeHazard, runAction, repairReviewRows, reviewRepair, normalizeHazardGrade, hazardColumns, isHazardOverdue } from '../src/api/local-service.ts'
import { listRows } from '../src/data/local-store.ts'
import { isoToday, isoOffsetDate } from '../src/data/date.ts'

let pass = 0
function check(name, cond) {
  if (!cond) throw new Error('断言失败: ' + name)
  pass++
  console.log('  ✓ ' + name)
}

// 兼容既有分级口径
check('重大归一', normalizeHazardGrade('红色风险') === '重大风险')
check('较大归一', normalizeHazardGrade('橙') === '较大风险')
check('一般归一', normalizeHazardGrade('三级') === '一般风险')
check('低风险归一', normalizeHazardGrade('Ⅳ级') === '低风险')
check('未知分级为 null', normalizeHazardGrade('特急') === null)

// 示例数据：逾期判定
const seeded = listRows('hazardledger')
check('种子 8 条', seeded.length === 8)
check('HAZ-0001 已逾期', isHazardOverdue(seeded[0]) === true)
check('已销号点不算逾期', isHazardOverdue(seeded[7]) === false)

// 分栏：逾期第一栏
const cols = hazardColumns()
check('共 6 栏（逾期+四档+其他）', cols.length === 6)
check('首栏为已过督办期限', cols[0].key === 'overdue')
check('逾期栏含 0006/0001/0002（按期限升序）', cols[0].items.map(r => r['隐患编号']).join() === 'HAZ-0006,HAZ-0001,HAZ-0002')
check('销号点回到低风险栏并带日期', cols[4].items.some(r => r['隐患编号'] === 'HAZ-0008' && r['销号日期']))

// 重复挂号按第一次认
const dup = registerHazard({ 隐患点位置: seeded[0]['隐患点位置'], 所属管段: 'x', 督办整改人: '张三', 督办期限: isoOffsetDate(3) })
check('重复挂号挡回', dup.ok === false)
check('仍 8 条', listRows('hazardledger').length === 8)

// 必填与日期
check('缺整改人挡回', registerHazard({ 隐患点位置: '新点A', 所属管段: 'g', 督办整改人: '', 督办期限: isoOffsetDate(3) }).ok === false)
check('非法日期挡回', registerHazard({ 隐患点位置: '新点A', 所属管段: 'g', 督办整改人: '李四', 督办期限: '2026-02-30' }).ok === false)

// 新挂号：统一重大起步
const reg = registerHazard({ 隐患点位置: '测试新点路 1 号', 所属管段: 'DN100 测试段', 督办整改人: '测试员', 督办期限: isoOffsetDate(5), 隐患来源: '巡检本' })
check('挂号成功', reg.ok === true)
const created = listRows('hazardledger').find(r => r['隐患点位置'] === '测试新点路 1 号')
check('起步为重大风险', created['风险分级'] === '重大风险' && created.status === '重大风险')
check('督办轮次 0', created['督办轮次'] === 0)
check('编号 HAZ-0009', created['隐患编号'] === 'HAZ-0009')

// 跨级处置一律挡回：重大 -> 一般
const skip = runAction('hazardledger', Number(created.id), '督办降为一般')
check('跨级被挡回', skip.ok === false)
check('挡回后仍是重大', listRows('hazardledger').find(r => r.id === created.id)['风险分级'] === '重大风险')
// 正确逐档
const step1 = runAction('hazardledger', Number(created.id), '督办降为较大')
check('重大->较大成功', step1.ok === true)
const after1 = listRows('hazardledger').find(r => r.id === created.id)
check('轮次变 1 且分级同步', after1['督办轮次'] === 1 && after1['风险分级'] === '较大风险')
// 回退挡回（当前较大，再降为较大没有该动作；验证一般档不能跳低之外，再验终态）
runAction('hazardledger', Number(created.id), '督办降为一般')
runAction('hazardledger', Number(created.id), '督办降为低风险')
// 已销号外的终态是低风险，再无可降动作；对已销号点督办挡回
const closedSeed = seeded.find(r => r['隐患编号'] === 'HAZ-0008')
check('对已销号点督办挡回', runAction('hazardledger', Number(closedSeed.id), '督办降为较大').ok === false)

// 销号日期缺失不予受理
const noDate = closeHazard(Number(created.id), '')
check('缺销号日期不受理', noDate.ok === false)
const badDate = closeHazard(Number(created.id), '2026-13-40')
check('假日期不受理', badDate.ok === false)
// 销号成功 -> 进抢修待复核
const before = repairReviewRows().length
const closed = closeHazard(Number(created.id), isoToday())
check('销号成功', closed.ok === true)
const afterClose = listRows('hazardledger').find(r => r.id === created.id)
check('状态已销号且有日期', afterClose.status === '已销号' && afterClose['销号日期'] === isoToday())
const reviews = repairReviewRows()
check('待复核 +1', reviews.length === before + 1)
const linked = reviews.find(r => r['来源隐患编号'] === 'HAZ-0009')
check('待复核单带管段/位置/销号日期', linked && linked['故障管段'] === 'DN100 测试段' && linked['隐患点位置'] === '测试新点路 1 号' && linked['销号日期'] === isoToday())
// 重复销号挡回
check('重复销号挡回', closeHazard(Number(created.id), isoToday()).ok === false)
// 同一隐患不重复生成待复核单
check('待复核不重复', repairReviewRows().filter(r => r['来源隐患编号'] === 'HAZ-0009').length === 1)
// 复核通过 -> 移出清单
const rv = reviewRepair(Number(linked.id), '合格')
check('复核通过', rv.ok === true)
check('已移出待复核', !repairReviewRows().some(r => r.id === linked.id))
// 种子里 HAZ-0008 对应 EMER-0031 也在待复核
check('种子待复核 EMER-0031', repairReviewRows().some(r => r['抢修编号'] === 'EMER-0031'))

console.log(`\n全部 ${pass} 条断言通过`)
