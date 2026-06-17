<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import ChatPanel from '../components/chat/ChatPanel.vue'
import { mainNavLinks } from '../constants/mainNav'
import { useChatStore } from '../stores/chat'

const navLinks = mainNavLinks
const router = useRouter()
const chat = useChatStore()
const loading = ref(false)
const loadError = ref('')
const deals = ref([])
const filterDropdownOpen = ref('')
const filters = ref({
  name: '',
  createdDate: '',
  sellers: [],
  buyers: [],
  creators: [],
  statuses: [],
})
const filterSearch = ref({
  sellers: '',
  buyers: '',
  creators: '',
  statuses: '',
})

const statusClassByName = (value) => {
  const normalized = String(value || '').toLowerCase()
  if (normalized.includes('заверш')) return 'status-completed'
  if (normalized.includes('отклон')) return 'status-rejected'
  if (normalized.includes('процесс') || normalized.includes('коммерчес')) return 'status-progress'
  return 'status-new'
}

const formatDate = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('ru-RU')
}

const rows = computed(() =>
  deals.value.map((deal, index) => ({
    order: index + 1,
    id: String(deal?.id || ''),
    name: String(deal?.name || '—'),
    seller: String(deal?.counterparties_from_name || '—'),
    buyer: String(deal?.counterparties_to_name || '—'),
    creator: String(deal?.created_by_user?.short_fio || deal?.created_by || '—'),
    createdAt: String(deal?.created_at || ''),
    statusName: String(deal?.status_name || '—'),
    statusClass: statusClassByName(deal?.status_name),
    chat_id: deal?.chat_id || null,
  })),
)

const sellerOptions = computed(() => [...new Set(rows.value.map((row) => row.seller).filter((v) => v && v !== '—'))].sort((a, b) => a.localeCompare(b, 'ru')))
const buyerOptions = computed(() => [...new Set(rows.value.map((row) => row.buyer).filter((v) => v && v !== '—'))].sort((a, b) => a.localeCompare(b, 'ru')))
const creatorOptions = computed(() => [...new Set(rows.value.map((row) => row.creator).filter((v) => v && v !== '—'))].sort((a, b) => a.localeCompare(b, 'ru')))
const statusOptions = computed(() => [...new Set(rows.value.map((row) => row.statusName).filter((v) => v && v !== '—'))].sort((a, b) => a.localeCompare(b, 'ru')))
const searchedSellerOptions = computed(() => sellerOptions.value.filter((v) => v.toLowerCase().includes(String(filterSearch.value.sellers || '').trim().toLowerCase())))
const searchedBuyerOptions = computed(() => buyerOptions.value.filter((v) => v.toLowerCase().includes(String(filterSearch.value.buyers || '').trim().toLowerCase())))
const searchedCreatorOptions = computed(() => creatorOptions.value.filter((v) => v.toLowerCase().includes(String(filterSearch.value.creators || '').trim().toLowerCase())))
const searchedStatusOptions = computed(() => statusOptions.value.filter((v) => v.toLowerCase().includes(String(filterSearch.value.statuses || '').trim().toLowerCase())))

const normalizeDateFilterValue = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

const filteredRows = computed(() => {
  const sellerSet = new Set(filters.value.sellers)
  const buyerSet = new Set(filters.value.buyers)
  const creatorSet = new Set(filters.value.creators)
  const statusSet = new Set(filters.value.statuses)
  const createdDate = String(filters.value.createdDate || '')
  const nameQ = String(filters.value.name || '').trim().toLowerCase()
  return rows.value.filter((row) => {
    if (nameQ && !String(row.name || '').toLowerCase().includes(nameQ)) return false
    if (sellerSet.size > 0 && !sellerSet.has(row.seller)) return false
    if (buyerSet.size > 0 && !buyerSet.has(row.buyer)) return false
    if (creatorSet.size > 0 && !creatorSet.has(row.creator)) return false
    if (statusSet.size > 0 && !statusSet.has(row.statusName)) return false
    if (createdDate && normalizeDateFilterValue(row.createdAt) !== createdDate) return false
    return true
  })
})

const toggleFilterDropdown = (key) => {
  filterDropdownOpen.value = filterDropdownOpen.value === key ? '' : key
  if (filterDropdownOpen.value !== key && filterSearch.value[key] != null) {
    filterSearch.value[key] = ''
  }
}

const toggleMultiFilterValue = (key, value) => {
  const current = new Set(filters.value[key] || [])
  if (current.has(value)) current.delete(value)
  else current.add(value)
  filters.value = {
    ...filters.value,
    [key]: Array.from(current),
  }
}

const resetFilters = () => {
  filters.value = {
    name: '',
    createdDate: '',
    sellers: [],
    buyers: [],
    creators: [],
    statuses: [],
  }
  filterSearch.value = {
    sellers: '',
    buyers: '',
    creators: '',
    statuses: '',
  }
  filterDropdownOpen.value = ''
}

const onWindowMouseDown = (event) => {
  const target = event?.target
  if (!(target instanceof Element) || !target.closest('.multi-filter')) {
    filterDropdownOpen.value = ''
  }
}

const openDeal = (dealId) => {
  router.push(`/deals/${encodeURIComponent(String(dealId))}`)
}

const createDeal = async () => {
  try {
    const res = await fetch('/apisup/supply/deals', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Новая сделка',
        status_id: '662ce068-3fc1-11f1-b298-bc241127d0bd',
      }),
    })
    if (!res.ok) throw new Error('deal create failed')
    const created = await res.json()
    const dealId = String(created?.id || '')
    if (dealId) {
      router.push(`/deals/${encodeURIComponent(dealId)}`)
      return
    }
    await loadDeals()
  } catch {
    loadError.value = 'Не удалось создать сделку.'
  }
}

const loadDeals = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetch('/apisup/supply/deals', { credentials: 'include' })
    if (!res.ok) throw new Error('deals load failed')
    const payload = await res.json()
    deals.value = Array.isArray(payload) ? payload : (payload?.items || [])
    nextTick(() => {
      for (const deal of deals.value) {
        if (deal.chat_id) chat.fetchBadge(deal.chat_id)
      }
    })
  } catch {
    deals.value = []
    loadError.value = 'Не удалось загрузить сделки.'
  } finally {
    loading.value = false
  }
}

const getBadge = (chatId) => {
  if (!chatId) return null
  const b = chat.badges[chatId]
  return b && b.mention ? 'mention' : b?.unread ? 'unread' : null
}

const handleChatOpen = ({ chatId, dealId, name }) => {
  chat.openPanel('deal', String(dealId), chatId, name)
}

const handleCloseChat = () => {
  const chatId = chat.currentChatId
  chat.closePanel()
  if (chatId) chat.refreshBadge(chatId)
}

onMounted(() => {
  window.addEventListener('mousedown', onWindowMouseDown)
  loadDeals()
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onWindowMouseDown)
})
</script>

<template>
  <div class="layout-shell">
    <TopNav :links="navLinks" />

    <main class="page-shell">
      <header class="page-head">
        <div>
          <p class="eyebrow">Коммерческий блок</p>
          <h1>Реестр сделок</h1>
        </div>
        <button type="button" class="primary-btn" @click="createDeal">Создать сделку</button>
      </header>

      <section class="registry-card">
        <div class="registry-filters">
          <input v-model="filters.name" class="form-input date-input" type="text" placeholder="Наименование сделки">
          <input v-model="filters.createdDate" class="form-input date-input" type="date">

          <div class="multi-filter">
            <button class="multi-filter-btn" type="button" @click.stop="toggleFilterDropdown('sellers')">
              {{ filters.sellers.length ? `Продавец (${filters.sellers.length})` : 'Продавец' }}
            </button>
            <div v-if="filterDropdownOpen === 'sellers'" class="multi-filter-list">
              <input v-model="filterSearch.sellers" class="multi-filter-search" type="text" placeholder="Поиск...">
              <button v-for="item in searchedSellerOptions" :key="`seller-${item}`" class="multi-filter-item" type="button" @click.stop="toggleMultiFilterValue('sellers', item)">
                <input type="checkbox" :checked="filters.sellers.includes(item)"> <span>{{ item }}</span>
              </button>
            </div>
          </div>

          <div class="multi-filter">
            <button class="multi-filter-btn" type="button" @click.stop="toggleFilterDropdown('buyers')">
              {{ filters.buyers.length ? `Покупатель (${filters.buyers.length})` : 'Покупатель' }}
            </button>
            <div v-if="filterDropdownOpen === 'buyers'" class="multi-filter-list">
              <input v-model="filterSearch.buyers" class="multi-filter-search" type="text" placeholder="Поиск...">
              <button v-for="item in searchedBuyerOptions" :key="`buyer-${item}`" class="multi-filter-item" type="button" @click.stop="toggleMultiFilterValue('buyers', item)">
                <input type="checkbox" :checked="filters.buyers.includes(item)"> <span>{{ item }}</span>
              </button>
            </div>
          </div>

          <div class="multi-filter">
            <button class="multi-filter-btn" type="button" @click.stop="toggleFilterDropdown('creators')">
              {{ filters.creators.length ? `Создатель (${filters.creators.length})` : 'Создатель' }}
            </button>
            <div v-if="filterDropdownOpen === 'creators'" class="multi-filter-list">
              <input v-model="filterSearch.creators" class="multi-filter-search" type="text" placeholder="Поиск...">
              <button v-for="item in searchedCreatorOptions" :key="`creator-${item}`" class="multi-filter-item" type="button" @click.stop="toggleMultiFilterValue('creators', item)">
                <input type="checkbox" :checked="filters.creators.includes(item)"> <span>{{ item }}</span>
              </button>
            </div>
          </div>

          <div class="multi-filter">
            <button class="multi-filter-btn" type="button" @click.stop="toggleFilterDropdown('statuses')">
              {{ filters.statuses.length ? `Статус (${filters.statuses.length})` : 'Статус' }}
            </button>
            <div v-if="filterDropdownOpen === 'statuses'" class="multi-filter-list">
              <input v-model="filterSearch.statuses" class="multi-filter-search" type="text" placeholder="Поиск...">
              <button v-for="item in searchedStatusOptions" :key="`status-${item}`" class="multi-filter-item" type="button" @click.stop="toggleMultiFilterValue('statuses', item)">
                <input type="checkbox" :checked="filters.statuses.includes(item)"> <span>{{ item }}</span>
              </button>
            </div>
          </div>

          <button type="button" class="reset-btn" @click="resetFilters">Сбросить</button>
        </div>

        <table class="registry-table">
          <colgroup>
            <col class="col-id">
            <col>
            <col class="col-party">
            <col class="col-party">
            <col class="col-creator">
            <col class="col-dates">
            <col class="col-status">
          </colgroup>
          <thead>
            <tr>
              <th>№</th>
              <th>Сделка</th>
              <th>Продавец</th>
              <th>Покупатель</th>
              <th>Создатель</th>
              <th>Даты</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredRows" :key="row.id">
              <td class="mono">
                <a href="#" class="deal-link" @click.prevent="openDeal(row.id)">{{ row.order }}</a>
              </td>
              <td>
                <div class="deal-name">{{ row.name }}</div>
                <button
                  class="deal-chat-btn"
                  type="button"
                  title="Чат сделки"
                  @click.stop="handleChatOpen({ chatId: row.chat_id, dealId: row.id, name: row.name })"
                >
                  <span class="deal-chat-icon-wrap">
                    <i class="fas fa-comment-dots"></i>
                    <span v-if="row.chat_id && getBadge(row.chat_id)" class="deal-chat-badge badge-red"></span>
                  </span>
                </button>
              </td>
              <td>{{ row.seller }}</td>
              <td>{{ row.buyer }}</td>
              <td>{{ row.creator }}</td>
              <td>
                <div class="date-stack">
                  <span>Создана: {{ formatDate(row.createdAt) }}</span>
                </div>
              </td>
              <td>
                <span class="status-chip" :class="row.statusClass">
                  {{ row.statusName }}
                </span>
              </td>
            </tr>
            <tr v-if="loading">
              <td colspan="7" class="empty-state">Загружаем сделки...</td>
            </tr>
            <tr v-else-if="loadError">
              <td colspan="7" class="empty-state">{{ loadError }}</td>
            </tr>
            <tr v-else-if="!filteredRows.length">
              <td colspan="7" class="empty-state">Сделок пока нет.</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>

    <ChatPanel v-if="chat.panelOpen" @close="handleCloseChat" />
  </div>
</template>

<style scoped>
.page-shell {
  padding: 24px;
}

.form-input {
  width: 100%;
  min-height: 40px;
  border-radius: 10px;
  border: 1px solid var(--border-light);
  background: var(--bg-body);
  color: var(--text-primary);
  padding: 0 12px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px var(--brand-soft);
  background: var(--bg-surface);
}

.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--brand-primary);
}

h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.1;
}

.primary-btn {
  border: none;
  border-radius: 12px;
  padding: 11px 16px;
  background: var(--brand-primary);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.primary-btn:hover {
  background: var(--brand-hover);
}

.registry-card {
  border: 1px solid var(--border-light);
  border-radius: 18px;
  background: var(--bg-surface);
  overflow: hidden;
}

.registry-filters {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 170px repeat(4, minmax(180px, 1fr)) 130px;
  gap: 12px;
  padding: 14px;
  border-bottom: 1px solid var(--border-light);
  background: #f8fafc;
}

.date-input,
.multi-filter-btn,
.reset-btn {
  height: 40px;
}

.date-input {
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 0 12px;
  background: #fff;
  color: var(--text-primary);
}

.multi-filter {
  position: relative;
}

.multi-filter-btn {
  width: 100%;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: #fff;
  padding: 0 12px;
  text-align: left;
  cursor: pointer;
  font-weight: 600;
  color: var(--text-primary);
}

.multi-filter-list {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 20;
  max-height: 260px;
  overflow: auto;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
}

.multi-filter-search {
  width: calc(100% - 16px);
  margin: 8px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 8px 10px;
  background: #fff;
}

.multi-filter-item {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
}

.multi-filter-item:hover {
  background: #f1f5f9;
}

.reset-btn {
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  font-weight: 600;
}

.registry-table {
  width: 100%;
  border-collapse: collapse;
}

.registry-table th,
.registry-table td {
  padding: 16px 18px;
  border: 1px solid var(--border-light);
  text-align: left;
  vertical-align: top;
}

.registry-table th {
  background: #f8fafc;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
}

.registry-table tbody tr:last-child td {
  border-bottom: none;
}

.col-id {
  width: 120px;
}

.col-party {
  width: 220px;
}

.col-creator {
  width: 200px;
}

.col-dates {
  width: 180px;
}

.col-status {
  width: 180px;
}

.mono {
  font-family: 'JetBrains Mono', monospace;
}

.deal-link {
  color: var(--brand-primary);
  text-decoration: none;
  font-weight: 700;
}

.deal-name {
  margin-bottom: 4px;
}

.deal-chat-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 2px;
  color: var(--text-secondary, #64748b);
}

.deal-chat-btn:hover {
  color: var(--brand-primary, #3b82f6);
}

.deal-chat-icon-wrap {
  position: relative;
  display: inline-flex;
}

.deal-chat-badge {
  position: absolute;
  top: -2px;
  right: -4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.deal-chat-badge.badge-red {
  background: #ef4444;
}

.date-stack {
  display: grid;
  gap: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 7px 14px;
  min-width: 220px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.status-new {
  background: #dbeafe;
  color: #1d4ed8;
}

.status-progress {
  background: #fef3c7;
  color: #b45309;
}

.status-completed {
  background: #dcfce7;
  color: #15803d;
}

.status-rejected {
  background: #fee2e2;
  color: #b91c1c;
}

.empty-state {
  text-align: center;
  color: var(--text-secondary);
  padding: 28px 18px;
}

@media (max-width: 1320px) {
  .registry-filters {
    grid-template-columns: repeat(2, minmax(240px, 1fr));
  }
}
</style>
