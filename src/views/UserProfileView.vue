<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import { mainNavLinks } from '../constants/mainNav'
import { useAuthStore } from '../stores/auth'

const navLinks = mainNavLinks
const route = useRoute()
const auth = useAuthStore()

const sections = [
  { key: 'main', label: 'Основная информация' },
  { key: 'mail', label: 'Почта' },
]

const activeSection = ref('main')
const smtpList = ref([])
const smtpLoading = ref(false)
const smtpError = ref('')
const smtpDeletingId = ref('')
const smtpModalOpen = ref(false)
const smtpModalMode = ref('create')
const smtpEditId = ref('')
const smtpSaving = ref(false)
const smtpForm = ref({
  email: '',
  password: '',
  port: 465,
  security: 'ssl',
})

const currentUserId = computed(() => String(route.params.userId || auth.user?.id || auth.user?.user_id || ''))

const normalizeText = (value) => String(value ?? '').trim()

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.data || payload?.items || payload?.results || []
}

const normalizeSingleOrArray = (payload) => {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object' && (payload.id || payload.email || payload.user_id)) {
    return [payload]
  }
  return normalizeArray(payload)
}

const fullName = computed(() => {
  const user = auth.user || {}
  const parts = [
    user.surname,
    user.name,
    user.patronymic || user.middle_name,
  ].map((value) => normalizeText(value)).filter(Boolean)
  return parts.join(' ') || '—'
})

const mainInfoItems = computed(() => {
  const user = auth.user || {}
  return [
    { label: 'ФИО', value: fullName.value },
    { label: 'Почта', value: normalizeText(user.username || user.email || user.email_work || user.email_personal) || '—' },
    {
      label: 'Пол',
      value: normalizeText(user.gender?.name || user.gender || user.sex?.name || user.sex) || '—',
    },
    {
      label: 'Дата рождения',
      value: formatDateOnly(user.birthday || user.birth_date || user.birthDate),
    },
  ]
})

function formatDateOnly(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return normalizeText(value) || '—'
  return date.toLocaleDateString('ru-RU')
}

const securityLabel = (value) => {
  const val = String(value || '').toLowerCase()
  if (val === 'ssl') return 'SSL'
  if (val === 'tls') return 'TLS'
  return 'Без защиты'
}

const formatDateTime = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const resetSmtpForm = () => {
  smtpForm.value = {
    email: '',
    password: '',
    port: 465,
    security: 'ssl',
  }
  smtpEditId.value = ''
}

const closeSmtpModal = () => {
  smtpModalOpen.value = false
  smtpModalMode.value = 'create'
  smtpSaving.value = false
  resetSmtpForm()
}

const openCreateSmtpModal = () => {
  smtpModalMode.value = 'create'
  resetSmtpForm()
  smtpModalOpen.value = true
}

const openEditSmtpModal = (item) => {
  smtpModalMode.value = 'edit'
  smtpEditId.value = String(item.id || '')
  smtpForm.value = {
    email: String(item.email || ''),
    password: '',
    port: Number(item.port || 465),
    security: String(item.security || 'ssl'),
  }
  smtpModalOpen.value = true
}

const normalizeSmtpList = (payload) => {
  return normalizeSingleOrArray(payload)
    .map((item) => ({
      id: String(item?.id || item?.smtp_id || ''),
      user_id: String(item?.user_id || ''),
      email: String(item?.email || ''),
      port: Number(item?.port || 465),
      security: String(item?.security || 'ssl'),
      created_at: item?.created_at || item?.createdAt || '',
    }))
    .filter((item) => item.id || item.email)
}

const loadSmtpList = async () => {
  const userId = currentUserId.value
  if (!userId) {
    smtpList.value = []
    return
  }

  smtpLoading.value = true
  smtpError.value = ''
  try {
    const res = await fetch(`/apisup/supply/smtp/by-user/${encodeURIComponent(userId)}`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('smtp load failed')
    smtpList.value = normalizeSmtpList(await res.json())
  } catch (error) {
    smtpList.value = []
    smtpError.value = 'Не удалось загрузить подключённые почты.'
  } finally {
    smtpLoading.value = false
  }
}

const saveSmtp = async () => {
  smtpError.value = ''
  const userId = currentUserId.value
  if (!userId) {
    smtpError.value = 'Не удалось определить пользователя.'
    return
  }

  const email = normalizeText(smtpForm.value.email)
  const password = normalizeText(smtpForm.value.password)
  const port = Number(smtpForm.value.port || 0)
  const security = String(smtpForm.value.security || 'none')

  if (!email) {
    smtpError.value = 'Укажите email.'
    return
  }
  if (!port || Number.isNaN(port)) {
    smtpError.value = 'Укажите порт.'
    return
  }
  if (smtpModalMode.value === 'create' && !password) {
    smtpError.value = 'Укажите пароль для новой почты.'
    return
  }

  smtpSaving.value = true
  try {
    const payload = {
      user_id: userId,
      email,
      port,
      security,
    }
    if (smtpModalMode.value === 'create' || password) {
      payload.password = password
    }
    const isEdit = smtpModalMode.value === 'edit' && smtpEditId.value
    const url = isEdit
      ? `/apisup/supply/smtp/${encodeURIComponent(smtpEditId.value)}`
      : '/apisup/supply/smtp'
    const method = isEdit ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error('smtp save failed')

    await loadSmtpList()
    closeSmtpModal()
  } catch (error) {
    smtpError.value = 'Не удалось сохранить почту.'
  } finally {
    smtpSaving.value = false
  }
}

const deleteSmtp = async (item) => {
  const smtpId = String(item?.id || '')
  if (!smtpId) return
  if (!window.confirm(`Удалить почту ${item.email}?`)) return

  smtpDeletingId.value = smtpId
  smtpError.value = ''
  try {
    const res = await fetch(`/apisup/supply/smtp/${encodeURIComponent(smtpId)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!res.ok) throw new Error('smtp delete failed')
    await loadSmtpList()
  } catch (error) {
    smtpError.value = 'Не удалось удалить почту.'
  } finally {
    smtpDeletingId.value = ''
  }
}

watch(
  currentUserId,
  async () => {
    if (!currentUserId.value) return
    await loadSmtpList()
  },
  { immediate: true }
)
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />

    <main class="main-content">
      <div class="content-header">
        <div>
          <h1 class="page-title">Настройки пользователя</h1>
          <p class="page-subtitle">Управление основной информацией и подключёнными почтами</p>
        </div>
      </div>

      <div class="profile-layout">
        <aside class="sidebar">
          <div class="sidebar-title">Разделы</div>
          <button
            v-for="section in sections"
            :key="section.key"
            class="sidebar-btn"
            :class="{ active: activeSection === section.key }"
            type="button"
            @click="activeSection = section.key"
          >
            {{ section.label }}
          </button>
        </aside>

        <section class="panel-wrap">
          <div v-if="activeSection === 'main'" class="panel">
            <div class="panel-head">
              <div>
                <h2 class="section-title">Основная информация</h2>
                <p class="section-subtitle">Эти данные подтягиваются из профиля текущего пользователя.</p>
              </div>
            </div>

            <div class="info-grid">
              <div v-for="item in mainInfoItems" :key="item.label" class="info-card">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
            </div>
          </div>

          <div v-else class="panel">
            <div class="panel-head panel-head-actions">
              <div>
                <h2 class="section-title">Почта</h2>
                <p class="section-subtitle">Подключённые SMTP-аккаунты для отправки писем.</p>
              </div>
              <button class="btn btn-primary" type="button" @click="openCreateSmtpModal">
                <i class="fas fa-plus"></i>
                Добавить почту
              </button>
            </div>

            <div v-if="smtpLoading" class="state">Загрузка почт...</div>
            <div v-else-if="smtpError" class="state error">{{ smtpError }}</div>
            <div v-else-if="!smtpList.length" class="empty-state">
              Подключённые почты пока отсутствуют.
            </div>
            <div v-else class="smtp-grid">
              <article v-for="smtp in smtpList" :key="smtp.id || smtp.email" class="smtp-card">
                <div class="smtp-card-top">
                  <div class="smtp-email">{{ smtp.email }}</div>
                  <div class="smtp-badge">{{ securityLabel(smtp.security) }}</div>
                </div>

                <div class="smtp-meta">
                  <div><span>Порт:</span> {{ smtp.port || '—' }}</div>
                  <div><span>Защита:</span> {{ smtp.security || '—' }}</div>
                  <div><span>Добавлена:</span> {{ formatDateTime(smtp.created_at) }}</div>
                </div>

                <div class="smtp-actions">
                  <button class="btn" type="button" @click="openEditSmtpModal(smtp)">
                    Изменить
                  </button>
                  <button
                    class="btn btn-danger"
                    type="button"
                    :disabled="smtpDeletingId === smtp.id"
                    @click="deleteSmtp(smtp)"
                  >
                    {{ smtpDeletingId === smtp.id ? 'Удаление...' : 'Удалить' }}
                  </button>
                </div>
              </article>
            </div>
          </div>
        </section>
      </div>
    </main>

    <div v-if="smtpModalOpen" class="modal-backdrop" @click="closeSmtpModal">
      <div class="modal-card" @click.stop>
        <div class="modal-title">
          {{ smtpModalMode === 'create' ? 'Добавить почту' : 'Изменить почту' }}
        </div>
        <div class="modal-subtitle">
          {{ smtpModalMode === 'create' ? 'Подключите новый SMTP-аккаунт' : 'Обновите параметры SMTP-аккаунта' }}
        </div>

        <div class="modal-grid">
          <label class="modal-field modal-field-wide">
            <span>Email</span>
            <input v-model="smtpForm.email" class="form-input" type="email" placeholder="name@company.ru" autocomplete="off">
          </label>
          <label class="modal-field">
            <span>Пароль</span>
            <input
              v-model="smtpForm.password"
              class="form-input"
              type="password"
              :placeholder="smtpModalMode === 'create' ? 'Введите пароль' : 'Введите новый пароль при необходимости'"
              autocomplete="new-password"
            >
          </label>
          <label class="modal-field">
            <span>Порт</span>
            <input v-model.number="smtpForm.port" class="form-input" type="number" min="1" max="65535" placeholder="465">
          </label>
          <label class="modal-field modal-field-wide">
            <span>Тип защиты</span>
            <select v-model="smtpForm.security" class="form-input">
              <option value="none">none</option>
              <option value="ssl">ssl</option>
              <option value="tls">tls</option>
            </select>
          </label>
        </div>

        <div class="modal-note">
          При редактировании можно оставить пароль пустым, если он не меняется.
        </div>

        <div class="modal-actions">
          <button class="btn" type="button" :disabled="smtpSaving" @click="closeSmtpModal">Отмена</button>
          <button class="btn btn-primary" type="button" :disabled="smtpSaving" @click="saveSmtp">
            {{ smtpSaving ? 'Сохранение...' : 'Сохранить' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  padding: 24px 32px;
  gap: 16px;
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.page-subtitle,
.section-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.profile-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.sidebar {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-bottom: 4px;
}

.sidebar-btn {
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  color: var(--text-primary);
  border-radius: 12px;
  padding: 10px 12px;
  text-align: left;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
}

.sidebar-btn:hover {
  background: var(--bg-subtle);
}

.sidebar-btn.active {
  background: var(--brand-primary);
  border-color: var(--brand-primary);
  color: #fff;
}

.panel-wrap {
  min-width: 0;
}

.panel {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 18px;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.section-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.panel-head-actions {
  align-items: center;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.info-card {
  border: 1px solid var(--border-light);
  border-radius: 14px;
  background: #fff;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-card span {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.info-card strong {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 600;
  white-space: pre-wrap;
}

.state,
.empty-state {
  padding: 16px;
  border: 1px dashed var(--border-light);
  border-radius: 14px;
  color: var(--text-secondary);
  font-size: 13px;
  background: var(--bg-subtle);
}

.state.error {
  color: var(--danger-text);
  background: var(--danger-bg);
}

.smtp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.smtp-card {
  border: 1px solid var(--border-light);
  border-radius: 16px;
  background: linear-gradient(180deg, #fff 0%, #f8fafc 100%);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--shadow-sm);
}

.smtp-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.smtp-email {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  word-break: break-word;
}

.smtp-badge {
  flex-shrink: 0;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--brand-light);
  color: var(--brand-primary);
  font-size: 11px;
  font-weight: 700;
}

.smtp-meta {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.smtp-meta span {
  color: var(--text-primary);
  font-weight: 600;
}

.smtp-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-danger {
  border: 1px solid rgba(220, 38, 38, 0.2);
  background: rgba(220, 38, 38, 0.08);
  color: #b91c1c;
}

.btn-danger:hover {
  background: rgba(220, 38, 38, 0.14);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.45);
  padding: 16px;
}

.modal-card {
  width: min(760px, 100%);
  max-height: calc(100vh - 32px);
  overflow: auto;
  background: linear-gradient(180deg, var(--bg-surface) 0%, #f8fafc 100%);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 20px;
}

.modal-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.modal-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.modal-grid {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.modal-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #fff;
  border: 1px solid var(--border-light);
  border-radius: 14px;
  padding: 12px 14px;
}

.modal-field-wide {
  grid-column: 1 / -1;
}

.modal-field > span {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.form-input {
  width: 100%;
  min-height: 40px;
  padding: 9px 12px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: #f8fafc;
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.modal-note {
  margin-top: 12px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.modal-actions {
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 1100px) {
  .profile-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .main-content {
    padding: 16px;
  }

  .info-grid,
  .modal-grid {
    grid-template-columns: 1fr;
  }
}
</style>
