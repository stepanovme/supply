<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import { mainNavLinks } from '../constants/mainNav'

const router = useRouter()

const navLinks = mainNavLinks
const SERVICE_ID = '7dd8be78-cf3a-423a-852f-eab3511fbe30'

const loading = ref(false)
const loadError = ref('')
const saveMessage = ref('')

const counterpartyOptions = ref([])
const objectOptions = ref([])
const warehouseOptions = ref([])
const userOptions = ref([])

const carrierOpen = ref(false)
const fromOpen = ref(false)
const toOpen = ref(false)
const driverOpen = ref(false)
const responsibleOpen = ref(false)
const docsOpen = ref(false)

const carrierQuery = ref('')
const fromQuery = ref('')
const toQuery = ref('')
const driverQuery = ref('')
const responsibleQuery = ref('')

const carrierId = ref('')
const possiblePickup = ref('')
const pickupPlanned = ref('')
const deliveryDate = ref('')
const deliveryTimeFrom = ref('')
const deliveryTimeTo = ref('')
const fromPlaceId = ref('')
const toPlaceId = ref('')
const responsibleIds = ref([])
const docsNeed = ref(['Спецификация', 'Договор', 'Накладная'])
const deliveryComment = ref('')
const driverId = ref('')

const docOptions = ['Спецификация', 'Договор', 'Накладная', 'Счет', 'Акт']

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const buildPlaceLabel = (item) => {
  const prefix = item?.kind === 'warehouse'
    ? 'Склад'
    : item?.kind === 'object'
      ? 'Объект'
      : 'Юридический адрес'
  const name = String(item?.name || '').trim()
  const address = String(item?.address || '').trim()
  if (!name && !address) return ''
  if (!address) return `${prefix} - ${name}`
  if (!name) return `${prefix} - ${address}`
  return `${prefix} - ${name} - ${address}`
}

const allPlaceOptions = computed(() => ([
  ...counterpartyOptions.value,
  ...warehouseOptions.value,
  ...objectOptions.value,
]).filter((item) => item.id && item.name))

const pageTitle = computed(() => 'Создание доставки')
const pageSubtitle = computed(() => 'Накладная на перемещение')

const filteredPlacesBy = (queryRef) => computed(() => {
  const q = String(queryRef.value || '').trim().toLowerCase()
  const source = allPlaceOptions.value
  if (!q) return source
  return source.filter((item) => {
    const name = String(item?.name || '').toLowerCase()
    const address = String(item?.address || '').toLowerCase()
    const label = String(buildPlaceLabel(item) || '').toLowerCase()
    return name.includes(q) || address.includes(q) || label.includes(q)
  })
})

const filteredCompaniesBy = (queryRef) => computed(() => {
  const q = String(queryRef.value || '').trim().toLowerCase()
  if (!q) return counterpartyOptions.value
  return counterpartyOptions.value.filter((item) => {
    const name = String(item?.name || '').toLowerCase()
    const address = String(item?.address || '').toLowerCase()
    const label = String(buildPlaceLabel(item) || '').toLowerCase()
    return name.includes(q) || address.includes(q) || label.includes(q)
  })
})

const filteredUsersBy = (queryRef) => computed(() => {
  const q = String(queryRef.value || '').trim().toLowerCase()
  if (!q) return userOptions.value
  return userOptions.value.filter((item) => String(item?.name || '').toLowerCase().includes(q))
})

const carrierOptionsFiltered = filteredCompaniesBy(carrierQuery)
const fromOptionsFiltered = filteredPlacesBy(fromQuery)
const toOptionsFiltered = filteredPlacesBy(toQuery)
const driverOptionsFiltered = filteredUsersBy(driverQuery)
const responsibleOptionsFiltered = filteredUsersBy(responsibleQuery)

const selectedResponsibles = computed(() => {
  const ids = new Set(responsibleIds.value.map((x) => String(x)))
  return userOptions.value.filter((u) => ids.has(String(u.id)))
})

const canSave = computed(() => Boolean(
  carrierId.value
  && fromPlaceId.value
  && toPlaceId.value
  && deliveryDate.value
))

const handleWindowMouseDown = (event) => {
  const target = event?.target
  if (!(target instanceof Element)) return
  if (!target.closest('.carrier-select')) carrierOpen.value = false
  if (!target.closest('.from-select')) fromOpen.value = false
  if (!target.closest('.to-select')) toOpen.value = false
  if (!target.closest('.driver-select')) driverOpen.value = false
  if (!target.closest('.responsible-select')) responsibleOpen.value = false
  if (!target.closest('.docs-select')) docsOpen.value = false
}

const openBack = () => {
  router.push('/deliveries')
}

const openCreateCounterparty = () => {
  window.open('/organizations/create', '_blank', 'noopener')
}

const resolveCounterpartyAddress = async (item) => {
  if (!item || item.kind !== 'company') return item
  if (String(item.address || '').trim()) return item
  try {
    let address = ''
    const detailEndpoints = [
      `/apiref/ref/counterparties/llc/${encodeURIComponent(item.id)}`,
      `/apiref/ref/counterparties/ip/${encodeURIComponent(item.id)}`,
      `/apiref/ref/counterparties/phys/${encodeURIComponent(item.id)}`,
    ]
    for (const endpoint of detailEndpoints) {
      // eslint-disable-next-line no-await-in-loop
      const detailRes = await fetch(endpoint, { credentials: 'include' })
      if (!detailRes.ok) continue
      // eslint-disable-next-line no-await-in-loop
      const detailPayload = await detailRes.json()
      address = String(
        detailPayload?.details?.legal_address
        || detailPayload?.details?.actual_address
        || detailPayload?.details?.postal_address
        || detailPayload?.address_registration
        || detailPayload?.address_living
        || ''
      ).trim()
      if (address) break
    }
    if (!address) return item
    const next = { ...item, address }
    counterpartyOptions.value = counterpartyOptions.value.map((row) => (row.id === item.id ? next : row))
    return next
  } catch {
    return item
  }
}

const selectCarrier = async (item) => {
  carrierId.value = String(item?.id || '')
  const resolved = await resolveCounterpartyAddress(item)
  carrierQuery.value = buildPlaceLabel(resolved) || String(resolved?.name || '')
  carrierOpen.value = false
}

const selectFrom = async (item) => {
  const resolved = await resolveCounterpartyAddress(item)
  fromPlaceId.value = `${String(resolved?.kind || 'company')}:${String(resolved?.id || '')}`
  fromQuery.value = buildPlaceLabel(resolved) || String(resolved?.name || '')
  fromOpen.value = false
}

const selectTo = async (item) => {
  const resolved = await resolveCounterpartyAddress(item)
  toPlaceId.value = `${String(resolved?.kind || 'company')}:${String(resolved?.id || '')}`
  toQuery.value = buildPlaceLabel(resolved) || String(resolved?.name || '')
  toOpen.value = false
}

const selectDriver = (item) => {
  driverId.value = String(item?.id || '')
  driverQuery.value = String(item?.name || '')
  driverOpen.value = false
}

const toggleResponsible = (item) => {
  const id = String(item?.id || '')
  if (!id) return
  if (responsibleIds.value.includes(id)) {
    responsibleIds.value = responsibleIds.value.filter((x) => x !== id)
  } else {
    responsibleIds.value = [...responsibleIds.value, id]
  }
}

const removeResponsible = (id) => {
  const key = String(id || '')
  responsibleIds.value = responsibleIds.value.filter((x) => x !== key)
}

const toggleDocNeed = (value) => {
  const key = String(value || '')
  if (!key) return
  if (docsNeed.value.includes(key)) {
    docsNeed.value = docsNeed.value.filter((item) => item !== key)
  } else {
    docsNeed.value = [...docsNeed.value, key]
  }
}

const loadOptions = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const counterpartiesRes = await fetch('/apiref/ref/counterparties', { credentials: 'include' })
    if (counterpartiesRes.ok) {
      const data = await counterpartiesRes.json()
      counterpartyOptions.value = normalizeArray(data).map((item) => ({
        id: String(item?.id || ''),
        name: String(item?.short_name || item?.full_name || item?.name || '').trim(),
        address: '',
        kind: 'company',
      })).filter((x) => x.id && x.name)
    }

    const objectsRes = await fetch('/apiref/ref/objects', { credentials: 'include' })
    if (objectsRes.ok) {
      const data = await objectsRes.json()
      objectOptions.value = normalizeArray(data).map((item) => ({
        id: String(item?.id || ''),
        name: String(item?.short_name || item?.full_name || item?.name || '').trim(),
        address: String(item?.address || item?.full_address || '').trim(),
        kind: 'object',
      })).filter((x) => x.id && x.name)
    }

    const warehousesRes = await fetch('/apisup/supply/warehouses', { credentials: 'include' })
    if (warehousesRes.ok) {
      const data = await warehousesRes.json()
      warehouseOptions.value = normalizeArray(data).map((item) => ({
        id: String(item?.id || ''),
        name: String(item?.name || item?.short_name || '').trim(),
        address: String(item?.address || item?.full_address || item?.location || '').trim(),
        kind: 'warehouse',
      })).filter((x) => x.id && x.name)
    }

    const usersRes = await fetch(`/api/as/users/service/${encodeURIComponent(SERVICE_ID)}?page=1&limit=100`, {
      credentials: 'include',
    })
    if (usersRes.ok) {
      const payload = await usersRes.json()
      userOptions.value = normalizeArray(payload?.items || payload).map((item) => ({
        id: String(item?.id || ''),
        name: [item?.surname, item?.name, item?.patronymic].filter(Boolean).join(' ').trim(),
      })).filter((x) => x.id && x.name)
    }
  } catch {
    loadError.value = 'Не удалось загрузить справочники для создания доставки.'
  } finally {
    loading.value = false
  }
}

const saveDelivery = () => {
  saveMessage.value = 'Форма доставки готова. Endpoint сохранения подключим следующим шагом.'
  window.setTimeout(() => {
    saveMessage.value = ''
  }, 3500)
}

onMounted(() => {
  loadOptions()
  window.addEventListener('mousedown', handleWindowMouseDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', handleWindowMouseDown)
})
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />

    <main class="main-content">
      <header class="page-head">
        <button type="button" class="back-btn" @click="openBack">
          <i class="fas fa-arrow-left"></i>
          Вернуться
        </button>
        <div>
          <h1 class="page-title">{{ pageTitle }}</h1>
          <p class="page-subtitle">{{ pageSubtitle }}</p>
        </div>
      </header>

      <div v-if="loading" class="inline-state">Загрузка...</div>
      <div v-else-if="loadError" class="inline-state error">{{ loadError }}</div>

      <section v-else class="plan-form">
        <div class="hero-line"></div>

        <div class="row one-col">
          <label class="field-label">Перевозчик</label>
          <div class="select-wrap carrier-select">
            <input
              v-model="carrierQuery"
              class="field-input"
              type="text"
              placeholder="Выберите перевозчика"
              @focus="carrierOpen = true"
              @input="carrierOpen = true"
            >
            <div v-if="carrierOpen" class="dropdown-list">
              <button type="button" class="dropdown-create" @mousedown.prevent @click="openCreateCounterparty">
                + Создать контрагента
              </button>
              <button
                v-for="item in carrierOptionsFiltered"
                :key="`carrier-${item.id}`"
                type="button"
                class="dropdown-item"
                @mousedown.prevent
                @click="selectCarrier(item)"
              >
                {{ buildPlaceLabel(item) || item.name }}
              </button>
            </div>
          </div>
        </div>

        <div class="row four-col">
          <div>
            <label class="field-label">Возможно забрать</label>
            <input v-model="possiblePickup" class="field-input" type="date">
          </div>
          <div>
            <label class="field-label">Планируем забрать</label>
            <input v-model="pickupPlanned" class="field-input" type="date">
          </div>
          <div class="span-two">
            <label class="field-label">Планируем доставить</label>
            <div class="delivery-window">
              <span class="delivery-window-label">С</span>
              <input v-model="deliveryDate" class="field-input slim" type="date">
              <input v-model="deliveryTimeFrom" class="field-input tiny" type="time">
              <span class="delivery-window-label">По</span>
              <input v-model="deliveryDate" class="field-input slim" type="date">
              <input v-model="deliveryTimeTo" class="field-input tiny" type="time">
            </div>
          </div>
        </div>

        <div class="row one-col">
          <div>
            <label class="field-label">Откуда везти</label>
            <div class="select-wrap from-select">
              <div class="inline-action-wrap">
                <input
                  v-model="fromQuery"
                  class="field-input"
                  type="text"
                  placeholder="Выберите компанию, склад или объект"
                  @focus="fromOpen = true"
                  @input="fromOpen = true"
                >
                <button type="button" class="mini-action" @click="openCreateCounterparty">
                  <i class="fas fa-plus"></i>
                </button>
              </div>
              <div v-if="fromOpen" class="dropdown-list">
                <button type="button" class="dropdown-create" @mousedown.prevent @click="openCreateCounterparty">
                  + Создать контрагента
                </button>
                <button
                  v-for="item in fromOptionsFiltered"
                  :key="`from-${item.id}`"
                  type="button"
                  class="dropdown-item"
                  @mousedown.prevent
                  @click="selectFrom(item)"
                >
                  {{ buildPlaceLabel(item) || item.name }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="row one-col">
          <div>
            <label class="field-label">Куда везти</label>
            <div class="select-wrap to-select">
              <div class="inline-action-wrap">
                <input
                  v-model="toQuery"
                  class="field-input"
                  type="text"
                  placeholder="Выберите компанию, склад или объект"
                  @focus="toOpen = true"
                  @input="toOpen = true"
                >
                <button type="button" class="mini-action" @click="openCreateCounterparty">
                  <i class="fas fa-plus"></i>
                </button>
              </div>
              <div v-if="toOpen" class="dropdown-list">
                <button type="button" class="dropdown-create" @mousedown.prevent @click="openCreateCounterparty">
                  + Создать контрагента
                </button>
                <button
                  v-for="item in toOptionsFiltered"
                  :key="`to-${item.id}`"
                  type="button"
                  class="dropdown-item"
                  @mousedown.prevent
                  @click="selectTo(item)"
                >
                  {{ buildPlaceLabel(item) || item.name }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="row one-col">
          <label class="field-label">Ответственный за приемку</label>
          <div class="select-wrap responsible-select">
            <div class="inline-action-wrap">
              <input
                v-model="responsibleQuery"
                class="field-input"
                type="text"
                placeholder="Поиск пользователя"
                @focus="responsibleOpen = true"
                @input="responsibleOpen = true"
              >
              <button type="button" class="mini-action">
                <i class="fas fa-plus"></i>
              </button>
            </div>
            <div v-if="responsibleOpen" class="dropdown-list">
              <button
                v-for="item in responsibleOptionsFiltered"
                :key="`resp-${item.id}`"
                type="button"
                class="dropdown-item checkbox-item"
                @mousedown.prevent
                @click="toggleResponsible(item)"
              >
                <input type="checkbox" :checked="responsibleIds.includes(item.id)" readonly>
                <span>{{ item.name }}</span>
              </button>
            </div>
          </div>
          <div v-if="selectedResponsibles.length" class="chips-row">
            <span v-for="item in selectedResponsibles" :key="`chip-${item.id}`" class="chip">
              <span>{{ item.name }}</span>
              <button type="button" class="chip-remove" @click="removeResponsible(item.id)">
                <i class="fas fa-times"></i>
              </button>
            </span>
          </div>
        </div>

        <div class="row one-col">
          <label class="field-label">Потребность в документах</label>
          <div class="select-wrap docs-select">
            <div class="inline-action-wrap">
              <input
                :value="docsNeed.join(', ')"
                class="field-input"
                type="text"
                placeholder="Выберите документы"
                readonly
                @focus="docsOpen = true"
                @click="docsOpen = true"
              >
              <button type="button" class="mini-action" @click="docsOpen = !docsOpen">
                <i class="fas" :class="docsOpen ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
              </button>
            </div>
            <div v-if="docsOpen" class="dropdown-list">
              <button
                v-for="item in docOptions"
                :key="item"
                type="button"
                class="dropdown-item checkbox-item"
                @mousedown.prevent
                @click="toggleDocNeed(item)"
              >
                <input type="checkbox" :checked="docsNeed.includes(item)" readonly>
                <span>{{ item }}</span>
              </button>
            </div>
          </div>
        </div>

        <div class="row two-col">
          <div>
            <label class="field-label">Водитель</label>
            <div class="select-wrap driver-select">
              <input
                v-model="driverQuery"
                class="field-input"
                type="text"
                placeholder="Выберите водителя"
                @focus="driverOpen = true"
                @input="driverOpen = true"
              >
              <div v-if="driverOpen" class="dropdown-list">
                <button
                  v-for="item in driverOptionsFiltered"
                  :key="`driver-${item.id}`"
                  type="button"
                  class="dropdown-item"
                  @mousedown.prevent
                  @click="selectDriver(item)"
                >
                  {{ item.name }}
                </button>
              </div>
            </div>
          </div>
          <div>
            <label class="field-label">Комментарий к доставке</label>
            <textarea v-model="deliveryComment" class="field-input textarea" rows="3"></textarea>
          </div>
        </div>
      </section>

      <div class="actions-row">
        <button type="button" class="plan-btn" :disabled="!canSave" @click="saveDelivery">
          Создать доставку
        </button>
        <span v-if="saveMessage" class="save-message">{{ saveMessage }}</span>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
  min-height: 100vh;
}

.main-content {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.page-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  padding: 7px 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.back-btn:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
}

.page-title {
  margin: 0;
  font-size: 22px;
  color: var(--text-primary);
}

.page-subtitle {
  margin: 2px 0 0;
  color: var(--text-tertiary);
  font-size: 13px;
}

.inline-state {
  font-size: 13px;
  color: var(--text-secondary);
}

.inline-state.error {
  color: var(--danger-text);
}

.plan-form {
  position: relative;
  border: 1px solid var(--border-light);
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.98)),
    radial-gradient(circle at top right, rgba(56, 189, 248, 0.09), transparent 32%);
  padding: 18px;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.06);
}

.row {
  display: grid;
  gap: 14px;
  margin-bottom: 14px;
}

.row:last-child {
  margin-bottom: 0;
}

.row.one-col {
  grid-template-columns: 1fr;
}

.row.two-col {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.row.four-col {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.span-two {
  grid-column: span 2;
}

.field-label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}

.field-input {
  width: 100%;
  min-height: 42px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: #fff;
  color: var(--text-primary);
  padding: 0 12px;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.02);
}

.textarea {
  min-height: 96px;
  padding: 10px 12px;
  resize: vertical;
}

.select-wrap {
  position: relative;
}

.dropdown-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 120;
  max-height: 240px;
  overflow: auto;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-surface);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.12);
}

.dropdown-item,
.dropdown-create {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--text-primary);
}

.dropdown-item:hover,
.dropdown-create:hover {
  background: var(--bg-subtle);
}

.dropdown-create {
  color: var(--brand-primary);
  font-weight: 600;
  border-bottom: 1px solid var(--border-light);
}

.inline-action-wrap {
  display: grid;
  grid-template-columns: 1fr 48px;
  gap: 0;
}

.inline-action-wrap .field-input {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.mini-action {
  border: 1px solid var(--border-light);
  border-left: none;
  border-top-right-radius: 10px;
  border-bottom-right-radius: 10px;
  background: linear-gradient(180deg, #f8fafc, #eef2f7);
  color: var(--text-secondary);
  cursor: pointer;
}

.mini-action:hover {
  color: var(--brand-primary);
}

.delivery-window {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 120px auto minmax(0, 1fr) 120px;
  gap: 8px;
  align-items: center;
}

.delivery-window-label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 600;
}

.field-input.slim,
.field-input.tiny {
  min-width: 0;
}

.chips-row {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  border-radius: 999px;
  padding: 5px 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.chip-remove {
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
}

.checkbox-item {
  gap: 10px;
}

.actions-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.plan-btn {
  border: 1px solid var(--brand-primary);
  border-radius: 10px;
  background: linear-gradient(180deg, var(--brand-primary), #1d4ed8);
  color: #fff;
  padding: 10px 14px;
  cursor: pointer;
  box-shadow: 0 10px 20px rgba(37, 99, 235, 0.18);
}

.plan-btn:disabled {
  opacity: 0.6;
  cursor: default;
  box-shadow: none;
}

.save-message {
  font-size: 13px;
  color: #166534;
}

@media (max-width: 1100px) {
  .row.four-col {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .span-two {
    grid-column: span 2;
  }

  .delivery-window {
    grid-template-columns: auto 1fr 120px;
  }
}

@media (max-width: 760px) {
  .main-content {
    padding: 16px;
  }

  .page-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .row.two-col,
  .row.four-col {
    grid-template-columns: 1fr;
  }

  .span-two {
    grid-column: auto;
  }

  .delivery-window {
    grid-template-columns: 1fr;
  }

  .inline-action-wrap {
    grid-template-columns: 1fr 44px;
  }
}
</style>
