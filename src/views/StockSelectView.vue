<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const requestId = String(route.params.requestId || '')
const preselectedItems = String(route.query.items || '').split(',').filter(Boolean)

const loading = ref(true)
const loadError = ref('')
const requestData = ref(null)
const requestItems = ref([])

const pickerOpen = ref(false)
const pickerLoading = ref(false)
const pickerQuery = ref('')
const pickerGroups = ref([])
const pickerTargetIdx = ref(-1)
const pickerTollOnly = ref(false)
const pickerReserved = ref({}) // warehouse_list_id -> total reserved qty

const getAvailableQty = (item) => {
  const total = normalizeMoney(item?.quantity)
  const wlid = String(item?.id || '')
  const reserved = normalizeMoney(pickerReserved.value[wlid])
  const alreadyTaken = normalizeMoney(
    requestItems.value
      .flatMap((ri) => ri.stockPicks)
      .filter((p) => p.warehouse_list_id === wlid)
      .reduce((sum, p) => sum + normalizeMoney(p.quantity), 0)
  )
  return Math.max(0, total - reserved - alreadyTaken)
}

const filteredPickerGroups = computed(() => {
  let groups = pickerGroups.value
    .map((g) => ({
      ...g,
      items: (Array.isArray(g.items) ? g.items : []).filter((item) => {
        if (pickerTollOnly.value && !item?.toll) return false
        if (getAvailableQty(item) <= 0) return false
        return true
      }),
    }))
    .filter((g) => (Array.isArray(g.items) ? g.items.length : 0) > 0)
  return groups
})

const selectedWarehouseListIds = computed(() => {
  const ids = new Set()
  const target = requestItems.value[pickerTargetIdx.value]
  if (target) {
    for (const pick of target.stockPicks) {
      if (pick.warehouse_list_id) ids.add(pick.warehouse_list_id)
    }
  }
  return ids
})

let tempIdCounter = 0
const nextTempId = () => `stock_${++tempIdCounter}_${Date.now()}`

onMounted(async () => {
  await loadRequestData()
})

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const normalizeMoney = (value) => {
  const num = Number(value || 0)
  return Number.isFinite(num) ? num : 0
}

const loadRequestData = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetch(`/apisup/supply/requests/${encodeURIComponent(requestId)}`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('request load failed')
    const payload = await res.json()
    requestData.value = payload

    let apiItems = normalizeArray(payload.items || []).filter(Boolean)
      .sort((a, b) => (a?.num || 0) - (b?.num || 0))

    if (preselectedItems.length > 0) {
      const preselectedSet = new Set(preselectedItems)
      apiItems = apiItems.filter((item) =>
        preselectedSet.has(String(item?.id || item?.item_id || item?.nomenclature?.id || item?.nomenclature_id || ''))
      )
    }

    requestItems.value = apiItems.map((item, idx) => {
      const requestItemId = String(item?.id || item?.item_id || '')
      return {
        id: requestItemId || String(item?.nomenclature?.id || item?.nomenclature_id || idx + 1),
        request_item_id: requestItemId,
        num: item?.num ?? idx + 1,
        name: item?.name || item?.nomenclature?.name || '—',
        unit_name: item?.unit?.name || item?.nomenclature?.unit?.name || '—',
        quantity: item?.quantity ?? '',
        stockPicks: [],
      }
    })
  } catch {
    loadError.value = 'Не удалось загрузить заявку.'
  } finally {
    loading.value = false
  }
}

const updateRequestQty = (idx, value) => {
  const num = Number(value)
  if (Number.isFinite(num)) {
    requestItems.value[idx].quantity = Math.max(1, num)
  }
}

const openPicker = (reqIdx) => {
  pickerTargetIdx.value = reqIdx
  pickerOpen.value = true
  pickerQuery.value = ''
  pickerGroups.value = []
  loadWarehouseItems()
}

const closePicker = () => {
  pickerOpen.value = false
  pickerTargetIdx.value = -1
  pickerQuery.value = ''
  pickerGroups.value = []
}

const loadWarehouseItems = async () => {
  pickerLoading.value = true
  try {
    const query = String(pickerQuery.value || '').trim()
    const url = query
      ? `/apisup/supply/warehouses/list/all?search=${encodeURIComponent(query)}`
      : '/apisup/supply/warehouses/list/all'

    const [warehouseRes, reservedRes] = await Promise.all([
      fetch(url, { credentials: 'include' }),
      fetch(`/apisup/supply/request-warehouse-lists?request_id=${encodeURIComponent(requestId)}`, {
        credentials: 'include',
      }).catch(() => null),
    ])

    if (!warehouseRes.ok) throw new Error('warehouse load failed')
    const warehousePayload = await warehouseRes.json()
    pickerGroups.value = Array.isArray(warehousePayload) ? warehousePayload : normalizeArray(warehousePayload)

    if (reservedRes && reservedRes.ok) {
      const reservedPayload = await reservedRes.json()
      const records = Array.isArray(reservedPayload) ? reservedPayload : normalizeArray(reservedPayload)
      const map = {}
      for (const r of records) {
        const wlid = String(r?.warehouse_list_id || '')
        if (wlid) {
          map[wlid] = (map[wlid] || 0) + normalizeMoney(r?.warehouse_quantity)
        }
      }
      pickerReserved.value = map
    } else {
      pickerReserved.value = {}
    }
  } catch {
    pickerGroups.value = []
    pickerReserved.value = {}
  } finally {
    pickerLoading.value = false
  }
}

const selectWarehouseItem = (item) => {
  if (pickerTargetIdx.value < 0) return
  const req = requestItems.value[pickerTargetIdx.value]
  if (!req) return
  const wlid = String(item?.id || '')
  if (wlid && selectedWarehouseListIds.value.has(wlid)) return
  const avail = getAvailableQty(item)
  if (avail <= 0) return
  req.stockPicks.push({
    tempId: nextTempId(),
    warehouse_id: String(item?.warehouse_id || ''),
    warehouse_list_id: String(item?.id || ''),
    nomenclature_id: String(item?.nomenclature_id || ''),
    nomenclature_name: String(item?.nomenclature_name || item?.name || ''),
    unit_name: String(item?.unit_name || '—'),
    quantity: Math.min(1, avail),
    maxQty: avail,
    request_qantity: Math.min(1, avail),
  })
  closePicker()
}

const removeStockPick = (reqIdx, pickIdx) => {
  requestItems.value[reqIdx].stockPicks.splice(pickIdx, 1)
}

const updateStockPickQty = (reqIdx, pickIdx, value) => {
  const pick = requestItems.value[reqIdx]?.stockPicks[pickIdx]
  if (!pick) return
  const num = normalizeMoney(value)
  pick.quantity = Math.min(Math.max(1, num), pick.maxQty)
}

const updateStockPickRequestQty = (reqIdx, pickIdx, value) => {
  const pick = requestItems.value[reqIdx]?.stockPicks[pickIdx]
  if (!pick) return
  pick.request_qantity = Math.max(0, normalizeMoney(value))
}

const goBack = () => {
  router.back()
}

const saving = ref(false)
const saveError = ref('')

const stockPicksCount = computed(() =>
  requestItems.value.reduce((sum, ri) => sum + ri.stockPicks.length, 0)
)

const save = async () => {
  saving.value = true
  saveError.value = ''

  const payloads = []
  for (const ri of requestItems.value) {
    for (const sp of ri.stockPicks) {
      payloads.push({
        request_id: Number(requestId),
        request_item_id: ri.request_item_id,
        warehouse_id: sp.warehouse_id,
        warehouse_list_id: sp.warehouse_list_id,
        request_qantity: normalizeMoney(sp.request_qantity),
        warehouse_quantity: normalizeMoney(sp.quantity),
      })
    }
  }

  if (!payloads.length) {
    saveError.value = 'Нет выбранных позиций со склада.'
    saving.value = false
    return
  }

  try {
    const results = await Promise.allSettled(
      payloads.map((body) =>
        fetch('/apisup/supply/request-warehouse-lists', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
      )
    )

    const errors = results.filter((r) => r.status === 'rejected')
    if (errors.length) {
      saveError.value = `Ошибка при сохранении ${errors.length} из ${payloads.length} позиций.`
      saving.value = false
      return
    }

    router.push({ name: 'home' })
  } catch {
    saveError.value = 'Ошибка сети. Попробуйте снова.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <button class="btn" type="button" @click="goBack">
        <i class="fas fa-arrow-left"></i> Назад
      </button>
      <h1>Выбрать из остатков</h1>
      <span v-if="requestData" class="request-title">Заявка #{{ requestId }}: {{ requestData.name || '' }}</span>
      <div class="header-actions">
        <span v-if="stockPicksCount" class="picks-badge">{{ stockPicksCount }}</span>
        <button class="btn btn-primary" type="button" :disabled="!stockPicksCount || saving" @click="save">
          <i class="fas fa-check"></i> {{ saving ? 'Сохранение...' : 'Выбрать' }}
        </button>
      </div>
    </header>

    <main class="main-content">
      <div v-if="loading" class="state-msg">Загрузка...</div>
      <div v-else-if="loadError" class="state-msg error">{{ loadError }}</div>
      <div v-else-if="saveError" class="state-msg error">{{ saveError }}</div>
      <template v-else>
        <div class="table-shell">
          <table class="stock-table">
            <colgroup>
              <col class="col-num">
              <col class="col-name">
              <col class="col-unit">
              <col class="col-qty">
              <col class="col-reqqty">
            </colgroup>
            <thead>
              <tr>
                <th>№</th>
                <th>Товар</th>
                <th>Ед. изм</th>
                <th>Кол-во со склада</th>
                <th>По заявке</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="(item, idx) in requestItems" :key="item.id">
                <tr class="row-group-sep" v-if="idx > 0">
                  <td colspan="5"></td>
                </tr>

                <tr class="section-label-row">
                  <td class="cell-num" rowspan="1">{{ item.num }}</td>
                  <td class="section-label" colspan="4">Из заявки</td>
                </tr>
                <tr class="req-row">
                  <td class="cell-subnum"></td>
                  <td>{{ item.name }}</td>
                  <td>{{ item.unit_name || '—' }}</td>
                  <td class="cell-qty">
                      <input
                        class="qty-input"
                        type="number"
                        min="1"
                        step="any"
                        :value="item.quantity"
                        @input="updateRequestQty(idx, $event.target.value)"
                      >
                  </td>
                  <td>—</td>
                </tr>

                <tr class="section-label-row">
                  <td class="cell-num"></td>
                  <td class="section-label" colspan="4">Из склада</td>
                </tr>
                <tr v-for="(pick, pIdx) in item.stockPicks" :key="pick.tempId" class="stock-row">
                  <td class="cell-subnum"></td>
                  <td>
                    <span class="selected-stock" @click="openPicker(idx)">
                      {{ pick.nomenclature_name }}
                      <i class="fas fa-pencil-alt"></i>
                    </span>
                  </td>
                  <td>{{ pick.unit_name || '—' }}</td>
                  <td class="cell-qty">
                    <div class="stock-qty-wrap">
                      <input
                        class="qty-input"
                        type="number"
                        min="1"
                        :max="pick.maxQty"
                        step="any"
                        :value="pick.quantity"
                        @input="updateStockPickQty(idx, pIdx, $event.target.value)"
                      >
                    </div>
                  </td>
                  <td class="cell-qty">
                    <input
                      class="qty-input"
                      type="number"
                      min="0"
                      step="any"
                      :value="pick.request_qantity"
                      @input="updateStockPickRequestQty(idx, pIdx, $event.target.value)"
                    >
                    <button class="remove-pick-btn" type="button" title="Убрать" @click="removeStockPick(idx, pIdx)">
                      <i class="fas fa-times"></i>
                    </button>
                  </td>
                </tr>
                <tr class="add-stock-row">
                  <td class="cell-subnum"></td>
                  <td colspan="4">
                    <button class="add-stock-btn" type="button" @click="openPicker(idx)">
                      <i class="fas fa-plus"></i> Выбрать товар со склада
                    </button>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </template>
    </main>

    <div v-if="pickerOpen" class="modal-backdrop" @click.self="closePicker">
      <div class="modal-card modal-card-wide">
        <div class="modal-header">
          <div>
            <h3>Выбрать товар со склада</h3>
            <p v-if="pickerTargetIdx >= 0 && requestItems[pickerTargetIdx]">
              Для строки {{ requestItems[pickerTargetIdx].num }}: {{ requestItems[pickerTargetIdx].name }}
            </p>
          </div>
          <button class="icon-close" type="button" @click="closePicker">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="picker-search-row">
          <input
            v-model="pickerQuery"
            class="field-control"
            type="text"
            placeholder="Поиск по складам и товарам..."
            @input="loadWarehouseItems"
          >
        </div>
        <div class="picker-filter-bar">
          <label class="toll-toggle" :class="{ active: pickerTollOnly }">
            <input type="checkbox" v-model="pickerTollOnly">
            <span class="toll-toggle-knob"></span>
            <span class="toll-toggle-label">Только давальческое</span>
          </label>
        </div>

        <div class="picker-layout">
          <div v-if="pickerLoading" class="picker-state">Загружаем товары...</div>
          <div v-else-if="!filteredPickerGroups.length" class="picker-state">Ничего не найдено.</div>
          <div v-else class="warehouse-tree">
            <section
              v-for="group in filteredPickerGroups"
              :key="group?.warehouse?.id || group?.warehouse?.name"
              class="warehouse-group"
            >
              <header class="warehouse-group__title">{{ group?.warehouse?.name || 'Склад' }}</header>
              <button
                v-for="item in (Array.isArray(group?.items) ? group.items : [])"
                :key="`${group?.warehouse?.id}-${item?.id}`"
                class="warehouse-item-btn"
                type="button"
                :class="{ 'already-selected': selectedWarehouseListIds.has(String(item?.id || '')) }"
                :disabled="getAvailableQty(item) <= 0 || selectedWarehouseListIds.has(String(item?.id || ''))"
                @click="selectWarehouseItem(item)"
              >
                <span class="warehouse-item-name">
                  {{ item?.nomenclature_name || item?.name || 'Без названия' }}
                  <span v-if="item?.toll" class="toll-badge">давальческое</span>
                </span>
                <small v-if="selectedWarehouseListIds.has(String(item?.id || ''))">Уже выбрано</small>
                <small v-else-if="item?.toll && item?.toll_company_name">{{ item.toll_company_name }} &middot; Доступно: {{ getAvailableQty(item) }} {{ item?.unit_name || '' }}</small>
                <small v-else>Доступно: {{ getAvailableQty(item) }} {{ item?.unit_name || '' }}</small>
              </button>
            </section>
          </div>
        </div>

        <div class="modal-actions">
          <button class="secondary-btn" type="button" @click="closePicker">Отмена</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.page-header h1 {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.page-header .header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.picks-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 11px;
  background: var(--brand-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--brand-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.85;
}

.request-title {
  font-size: 13px;
  color: var(--text-secondary);
}

.main-content {
  flex-grow: 1;
  padding: 24px;
  overflow: auto;
}

.state-msg {
  font-size: 13px;
  color: var(--text-secondary);
  padding: 24px;
  text-align: center;
}

.state-msg.error {
  color: var(--danger-text);
}

.table-shell {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.stock-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  font-size: 13px;
}

.col-num { width: 60px; }
.col-name { width: auto; }
.col-unit { width: 110px; }
.col-qty { width: 150px; }
.col-reqqty { width: 150px; }

.stock-table th {
  text-align: left;
  padding: 10px 12px;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border-light);
}

.stock-table td {
  padding: 6px 12px;
  border-bottom: none;
  color: var(--text-primary);
  vertical-align: middle;
}

.row-group-sep td {
  padding: 0;
  height: 8px;
  background: var(--bg-body);
  border-bottom: none;
}

.section-label-row td {
  padding: 4px 12px 2px;
  border-bottom: none;
}

.section-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-tertiary);
  padding-left: 0;
}

.cell-num {
  text-align: center;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  width: 60px;
}

.cell-subnum {
  width: 60px;
}

.req-row td {
  padding: 2px 12px 6px;
  border-bottom: 1px dotted var(--border-light);
}

.stock-row td {
  padding: 4px 12px;
  border-bottom: none;
}

.add-stock-row td {
  padding: 2px 12px 8px;
  border-bottom: 1px solid var(--border-light);
}

.cell-qty {
  text-align: right;
}

.qty-input {
  width: 100px;
  min-height: 30px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-light);
  background: var(--bg-body);
  color: var(--text-primary);
  padding: 0 8px;
  font-size: 13px;
  text-align: right;
}

.qty-input:focus {
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px var(--brand-soft);
  background: var(--bg-surface);
}

.stock-qty-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.remove-pick-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 11px;
  cursor: pointer;
}

.remove-pick-btn:hover {
  background: var(--danger-bg);
  color: var(--danger-text);
}

.selected-stock {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: var(--brand-primary);
  font-weight: 500;
  font-size: 13px;
}

.selected-stock:hover {
  opacity: 0.75;
}

.add-stock-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  border: 1px dashed var(--brand-primary);
  background: transparent;
  color: var(--brand-primary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.add-stock-btn:hover {
  background: var(--brand-light);
  border-style: solid;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal-card-wide {
  width: min(820px, 100%);
  max-height: calc(100vh - 40px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 20px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}

.modal-header h3 {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.modal-header p {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.icon-close {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 4px;
}

.icon-close:hover {
  color: var(--text-primary);
}

.picker-search-row {
  margin-bottom: 8px;
}

.picker-filter-bar {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}

.toll-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  padding: 4px 0;
}

.toll-toggle input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.toll-toggle-knob {
  position: relative;
  width: 34px;
  height: 20px;
  border-radius: 10px;
  background: var(--border-light);
  transition: background 0.2s;
  flex-shrink: 0;
}

.toll-toggle-knob::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--bg-surface);
  transition: transform 0.2s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.15);
}

.toll-toggle.active .toll-toggle-knob {
  background: var(--brand-primary);
}

.toll-toggle.active .toll-toggle-knob::after {
  transform: translateX(14px);
}

.toll-toggle-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.toll-toggle.active .toll-toggle-label {
  color: var(--brand-primary);
}

.toll-badge {
  display: inline-block;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: #a16207;
  background: #fef9c3;
  border-radius: 3px;
  padding: 1px 5px;
  margin-left: 6px;
  vertical-align: middle;
}

.field-control {
  width: 100%;
  min-height: 40px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-body);
  color: var(--text-primary);
  padding: 0 12px;
  font-size: 14px;
}

.field-control:focus {
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px var(--brand-soft);
  background: var(--bg-surface);
}

.picker-layout {
  flex-grow: 1;
  overflow: auto;
  min-height: 200px;
  max-height: 400px;
}

.picker-state {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.warehouse-tree {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.warehouse-group {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.warehouse-group__title {
  padding: 8px 12px;
  background: var(--bg-subtle);
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-light);
}

.warehouse-item-btn {
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: none;
  border-bottom: 1px solid var(--border-light);
  background: transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.warehouse-item-btn:last-child {
  border-bottom: none;
}

.warehouse-item-btn:hover {
  background: var(--bg-subtle);
}

.warehouse-item-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.warehouse-item-btn.already-selected:disabled {
  opacity: 0.6;
  background: var(--bg-subtle);
}

.warehouse-item-btn.already-selected small {
  color: var(--success-text, #16a34a);
  font-weight: 600;
}

.warehouse-item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.warehouse-item-btn small {
  font-size: 11px;
  color: var(--text-tertiary);
}

.modal-actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.secondary-btn {
  padding: 8px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}

.secondary-btn:hover {
  background: var(--bg-subtle);
}
</style>
