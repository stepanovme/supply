<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import { mainNavLinks } from '../constants/mainNav'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()
const navLinks = mainNavLinks

const NAV_GROUPS = [
  {
    title: 'Закупки и продажи', icon: 'fa-cart-shopping',
    tiles: [
      { label: 'Заявки', path: '/requests', icon: 'fa-file-lines', color: '#3b82f6' },
      { label: 'Счета', path: '/invoices', icon: 'fa-file-invoice', color: '#f59e0b' },
      { label: 'Сделки', path: '/deals', icon: 'fa-handshake', color: '#22c55e' },
      { label: 'Платежи', path: '/payments', icon: 'fa-credit-card', color: '#8b5cf6' },
    ],
  },
  {
    title: 'Документы и логистика', icon: 'fa-boxes-stacked',
    tiles: [
      { label: 'Документы', path: '/documents', icon: 'fa-folder-open', color: '#0ea5e9' },
      { label: 'Доставки', path: '/deliveries', icon: 'fa-truck', color: '#ef4444' },
      { label: 'Склад', path: '/warehouses', icon: 'fa-warehouse', color: '#64748b' },
    ],
  },
  {
    title: 'Работа и команда', icon: 'fa-people-group',
    tiles: [
      { label: 'Задачи', path: '/tasks', icon: 'fa-list-check', color: '#6366f1' },
      { label: 'Проекты', path: '/projects', icon: 'fa-diagram-project', color: '#14b8a6' },
      { label: 'Пользователи', path: '/users', icon: 'fa-users', color: '#ec4899' },
      { label: 'База знаний', path: '/wiki', icon: 'fa-book', color: '#0891b2' },
    ],
  },
]

const greeting = () => {
  const h = new Date().getHours()
  if (h < 6) return 'Доброй ночи'
  if (h < 12) return 'Доброе утро'
  if (h < 18) return 'Добрый день'
  return 'Добрый вечер'
}

const fmtDate = (s) => {
  const d = new Date(s)
  if (isNaN(d)) return ''
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const arr = (d) => Array.isArray(d) ? d : (d?.items ?? d?.data ?? d?.results ?? [])

const requests = ref([])
const invoices = ref([])
const tasks = ref([])
const loading = ref({ requests: true, invoices: true, tasks: true })

const load = async (url, target, key, map) => {
  try {
    const r = await fetch(url, { credentials: 'include' })
    if (r.ok) target.value = arr(await r.json()).slice(0, 5).map(map)
  } catch {} finally { loading.value[key] = false }
}

const taskStatusColor = (name) => {
  const n = (name || '').toLowerCase()
  if (n.includes('заверш')) return '#16a34a'
  if (n.includes('выполня')) return '#2563eb'
  return '#b45309'
}

onMounted(() => {
  load('/apisup/supply/requests/my', requests, 'requests', r => ({
    id: r.id, title: r.name || r.number || `Заявка №${r.id}`, sub: r.status_name || '', date: r.created_at,
  }))
  load('/apisup/supply/invoices/my', invoices, 'invoices', r => ({
    id: r.id, title: r.number ? `Счёт №${r.number}` : `Счёт №${r.id}`, sub: r.counterparty_name || r.status_name || '', date: r.created_at,
  }))
  load('/apisup/supply/tasks/my', tasks, 'tasks', r => ({
    id: r.id, title: r.name, sub: r.status_name || '', date: r.created_at,
  }))
})

const goRequest = (id) => router.push({ name: 'request-detail', params: { requestId: id } })
const goInvoice = (id) => router.push({ name: 'invoice-detail', params: { invoiceId: id } })
const goTask = (id) => router.push({ name: 'tasks', query: { task: id } })
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />
    <main class="dash">
      <div class="dash-hero">
        <h1 class="dash-hello">{{ greeting() }}, {{ auth.user?.name || 'коллега' }}!</h1>
        <p class="dash-sub">Быстрый доступ к разделам и последние события</p>
      </div>

      <!-- Навигация плитками, сгруппированная по категориям -->
      <div class="dash-groups">
        <div v-for="g in NAV_GROUPS" :key="g.title" class="dash-group">
          <div class="dash-group-title"><i class="fas" :class="g.icon"></i> {{ g.title }}</div>
          <div class="dash-tiles">
            <button v-for="t in g.tiles" :key="t.path" class="dash-tile" @click="router.push(t.path)">
              <span class="dash-tile-icon" :style="{ background: t.color + '18', color: t.color }"><i class="fas" :class="t.icon"></i></span>
              <span class="dash-tile-label">{{ t.label }}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="dash-grid">
        <!-- Заявки -->
        <section class="dash-card">
          <div class="dash-card-head"><i class="fas fa-file-lines" style="color:#3b82f6"></i> Последние заявки
            <button class="dash-more" @click="router.push('/requests')">Все <i class="fas fa-arrow-right"></i></button>
          </div>
          <div v-if="loading.requests" class="dash-state">Загрузка...</div>
          <div v-else-if="!requests.length" class="dash-state">Нет заявок</div>
          <button v-for="it in requests" :key="it.id" class="dash-row" @click="goRequest(it.id)">
            <span class="dash-row-title">{{ it.title }}</span>
            <span class="dash-row-sub">{{ it.sub }}</span>
            <span class="dash-row-date">{{ fmtDate(it.date) }}</span>
          </button>
        </section>

        <!-- Счета -->
        <section class="dash-card">
          <div class="dash-card-head"><i class="fas fa-file-invoice" style="color:#f59e0b"></i> Последние счета
            <button class="dash-more" @click="router.push('/invoices')">Все <i class="fas fa-arrow-right"></i></button>
          </div>
          <div v-if="loading.invoices" class="dash-state">Загрузка...</div>
          <div v-else-if="!invoices.length" class="dash-state">Нет счетов</div>
          <button v-for="it in invoices" :key="it.id" class="dash-row" @click="goInvoice(it.id)">
            <span class="dash-row-title">{{ it.title }}</span>
            <span class="dash-row-sub">{{ it.sub }}</span>
            <span class="dash-row-date">{{ fmtDate(it.date) }}</span>
          </button>
        </section>

        <!-- Задачи -->
        <section class="dash-card">
          <div class="dash-card-head"><i class="fas fa-list-check" style="color:#6366f1"></i> Мои задачи
            <button class="dash-more" @click="router.push('/tasks')">Все <i class="fas fa-arrow-right"></i></button>
          </div>
          <div v-if="loading.tasks" class="dash-state">Загрузка...</div>
          <div v-else-if="!tasks.length" class="dash-state">Нет задач</div>
          <button v-for="it in tasks" :key="it.id" class="dash-row" @click="goTask(it.id)">
            <span class="dash-row-title">{{ it.title }}</span>
            <span class="dash-row-sub" :style="{ color: taskStatusColor(it.sub) }">{{ it.sub }}</span>
            <span class="dash-row-date">{{ fmtDate(it.date) }}</span>
          </button>
        </section>

        <!-- Обновления -->
        <section class="dash-card">
          <div class="dash-card-head"><i class="fas fa-bullhorn" style="color:#0ea5e9"></i> Последние обновления</div>
          <div class="dash-upd">
            <div class="dash-upd-item"><span class="dash-upd-dot"></span><div><div class="dash-upd-title">Тикеты поддержки</div><div class="dash-upd-text">Теперь можно создавать обращения через «Написать нам».</div></div></div>
            <div class="dash-upd-item"><span class="dash-upd-dot"></span><div><div class="dash-upd-title">Связи документов</div><div class="dash-upd-text">Договоры и письма можно связывать между собой.</div></div></div>
            <div class="dash-upd-item"><span class="dash-upd-dot"></span><div><div class="dash-upd-title">Отделы и группы</div><div class="dash-upd-text">Создание отделов и управление участниками.</div></div></div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.dash { flex: 1; overflow-y: auto; padding: 24px 32px 48px; background: var(--bg-page, #f8fafc); }
.dash-hero { margin-bottom: 20px; }
.dash-hello { font-size: 26px; font-weight: 800; color: var(--text-primary, #1e293b); letter-spacing: -0.5px; }
.dash-sub { font-size: 13px; color: var(--text-secondary, #64748b); margin-top: 4px; }

.dash-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-bottom: 26px; align-items: start; }
.dash-group { border: 1px solid var(--border-light, #e2e8f0); border-radius: 16px; background: var(--bg-surface, #fff); padding: 14px 16px 16px; }
.dash-group-title { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-tertiary, #94a3b8); margin-bottom: 12px; }
.dash-tiles { display: flex; flex-direction: column; gap: 8px; }
.dash-tile {
  display: flex; flex-direction: row; align-items: center; gap: 12px; width: 100%; text-align: left;
  padding: 10px 12px; border: 1px solid var(--border-light, #e2e8f0); border-radius: 10px;
  background: var(--bg-surface, #fff); cursor: pointer; transition: background 0.12s, border-color 0.12s;
}
.dash-tile:hover { background: var(--bg-subtle, #f1f5f9); border-color: var(--brand-primary, #3b82f6); }
.dash-tile-icon { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; }
.dash-tile-label { font-size: 13px; font-weight: 600; color: var(--text-primary, #1e293b); }

.dash-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.dash-card { border: 1px solid var(--border-light, #e2e8f0); border-radius: 14px; background: var(--bg-surface, #fff); padding: 16px 18px; }
.dash-card-head { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; color: var(--text-primary, #1e293b); margin-bottom: 10px; }
.dash-more { margin-left: auto; border: none; background: none; cursor: pointer; color: var(--brand-primary, #3b82f6); font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; }
.dash-state { padding: 20px; text-align: center; color: var(--text-tertiary, #94a3b8); font-size: 13px; }
.dash-row {
  display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto; gap: 2px 10px;
  width: 100%; text-align: left; border: none; background: none; cursor: pointer;
  padding: 9px 8px; border-radius: 8px; border-bottom: 1px solid var(--border-light, #f1f5f9);
}
.dash-row:last-child { border-bottom: none; }
.dash-row:hover { background: var(--bg-subtle, #f1f5f9); }
.dash-row-title { font-size: 13px; font-weight: 600; color: var(--text-primary, #1e293b); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dash-row-sub { grid-column: 1; font-size: 11px; color: var(--text-secondary, #64748b); }
.dash-row-date { grid-column: 2; grid-row: 1 / span 2; align-self: center; font-size: 11px; color: var(--text-tertiary, #94a3b8); white-space: nowrap; }

.dash-upd { display: flex; flex-direction: column; gap: 12px; padding-top: 4px; }
.dash-upd-item { display: flex; gap: 10px; }
.dash-upd-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--brand-primary, #3b82f6); margin-top: 5px; flex-shrink: 0; }
.dash-upd-title { font-size: 13px; font-weight: 600; color: var(--text-primary, #1e293b); }
.dash-upd-text { font-size: 12px; color: var(--text-secondary, #64748b); margin-top: 1px; }
</style>
