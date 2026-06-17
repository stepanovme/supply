<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const loading = ref(false)
const loadError = ref('')
const saving = ref(false)
const saveError = ref('')
const saveSuccess = ref('')

const linkData = ref(null)
const requestSupplierId = ref('')
const attachedFiles = ref([])
const uploadInputRef = ref(null)
const selectedFiles = ref([])

const linkCode = computed(() => String(route.params.code || '').trim())

const normalizeText = (value) => String(value ?? '').trim()

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const formatDateTime = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return normalizeText(value) || '—'
  return date.toLocaleString('ru-RU')
}

const normalizeLinkPayload = (payload) => {
  if (Array.isArray(payload)) return payload[0] || null
  if (payload && typeof payload === 'object') return payload
  return null
}

const getLinkInfo = async () => {
  if (!linkCode.value) throw new Error('Не указан код ссылки.')
  const res = await fetch(`/apisup/supply/request-suppliers/link/${encodeURIComponent(linkCode.value)}`)
  if (!res.ok) throw new Error('Не удалось загрузить ссылку.')
  const payload = normalizeLinkPayload(await res.json())
  if (!payload) throw new Error('Ссылка не найдена.')
  linkData.value = payload
  requestSupplierId.value = String(payload.request_supplier_id || payload.requestSupplierId || payload.id || '')
  if (!requestSupplierId.value) throw new Error('Не удалось определить запрос поставщика.')
}

const loadAttachedFiles = async () => {
  if (!requestSupplierId.value) return
  const res = await fetch(`/apisup/supply/request-suppliers/${encodeURIComponent(requestSupplierId.value)}/files`)
  if (!res.ok) throw new Error('Не удалось загрузить прикреплённые файлы.')
  attachedFiles.value = normalizeArray(await res.json())
}

const openFilePicker = () => {
  uploadInputRef.value?.click()
}

const onPickFiles = async (event) => {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!files.length) return
  selectedFiles.value = files
}

const uploadOneFile = async (file) => {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`/apisup/supply/request-suppliers/${encodeURIComponent(requestSupplierId.value)}/files`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) throw new Error('Не удалось загрузить файл.')
}

const uploadSelectedFiles = async () => {
  if (!requestSupplierId.value) {
    saveError.value = 'Не удалось определить запрос поставщика.'
    return
  }
  if (!selectedFiles.value.length) {
    saveError.value = 'Выберите файл для загрузки.'
    return
  }
  saving.value = true
  saveError.value = ''
  saveSuccess.value = ''
  try {
    for (const file of selectedFiles.value) {
      // API принимает по одному файлу.
      // eslint-disable-next-line no-await-in-loop
      await uploadOneFile(file)
    }
    selectedFiles.value = []
    await loadAttachedFiles()
    saveSuccess.value = 'Счёт успешно прикреплён.'
    setTimeout(() => {
      saveSuccess.value = ''
    }, 3000)
  } catch (error) {
    saveError.value = normalizeText(error?.message) || 'Не удалось прикрепить счёт.'
  } finally {
    saving.value = false
  }
}

const getFileLabel = (file) => normalizeText(file?.original_name || file?.name || file?.file_name || file?.title || 'Файл')

onMounted(async () => {
  loading.value = true
  loadError.value = ''
  try {
    await getLinkInfo()
    await loadAttachedFiles()
  } catch (error) {
    loadError.value = normalizeText(error?.message) || 'Не удалось открыть страницу прикрепления счёта.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="public-page">
    <section class="public-card">
      <div class="badge">Загрузка счёта поставщика</div>
      <h1 class="title">Прикрепите счёт по ссылке</h1>
      <p class="subtitle">
        Публичная страница для загрузки счёта без авторизации.
        Код ссылки: <strong>{{ linkCode }}</strong>
      </p>

      <div v-if="loading" class="state">Загрузка...</div>
      <div v-else-if="loadError" class="state error">{{ loadError }}</div>

      <template v-else>
        <div class="info-grid">
          <div class="info-box">
            <span>Запрос поставщика</span>
            <strong>#{{ requestSupplierId }}</strong>
          </div>
          <div class="info-box">
            <span>Ссылка</span>
            <strong>{{ linkData?.code || linkCode }}</strong>
          </div>
          <div class="info-box">
            <span>Статус</span>
            <strong>{{ linkData?.status || 'active' }}</strong>
          </div>
          <div class="info-box">
            <span>Создано</span>
            <strong>{{ formatDateTime(linkData?.created_at) }}</strong>
          </div>
        </div>

        <div class="upload-zone">
          <input ref="uploadInputRef" class="hidden-input" type="file" accept="application/pdf,.pdf,.jpg,.jpeg,.png,.xls,.xlsx,.doc,.docx" multiple @change="onPickFiles">
          <button class="btn" type="button" @click="openFilePicker">Выбрать файл</button>
          <div class="upload-hint">
            Можно прикрепить один или несколько файлов. После выбора нажмите <strong>«Прикрепить счёт»</strong>.
          </div>
          <div v-if="selectedFiles.length" class="selected-list">
            <div v-for="file in selectedFiles" :key="`${file.name}-${file.size}`" class="selected-item">
              {{ file.name }}
            </div>
          </div>
          <button class="btn btn-primary" type="button" :disabled="saving || !selectedFiles.length" @click="uploadSelectedFiles">
            {{ saving ? 'Загрузка...' : 'Прикрепить счёт' }}
          </button>
        </div>

        <div v-if="saveError" class="state error">{{ saveError }}</div>
        <div v-if="saveSuccess" class="state success">{{ saveSuccess }}</div>

        <div class="files-section">
          <h2 class="section-title">Уже прикреплённые файлы</h2>
          <div v-if="!attachedFiles.length" class="empty">Файлы ещё не прикреплены.</div>
          <div v-else class="files-list">
            <div v-for="file in attachedFiles" :key="file.id || file.original_name || file.name" class="file-row">
              <span>{{ getFileLabel(file) }}</span>
              <span class="file-date">{{ formatDateTime(file.created_at || file.createdAt) }}</span>
            </div>
          </div>
        </div>
      </template>
    </section>
  </main>
</template>

<style scoped>
.public-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  background: linear-gradient(180deg, #eff6ff 0%, #f8fafc 48%, #f1f5f9 100%);
  color: #0f172a;
}

.public-card {
  width: 100%;
  max-width: 780px;
  background: #ffffff;
  border: 1px solid #dbe4f0;
  border-radius: 24px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.12);
  padding: 28px;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.title {
  margin: 14px 0 8px;
  font-size: 30px;
  line-height: 1.15;
  font-weight: 800;
}

.subtitle {
  margin: 0 0 24px;
  color: #475569;
  line-height: 1.6;
}

.state {
  padding: 14px 16px;
  border-radius: 16px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 14px;
  font-weight: 600;
}

.state.error {
  background: #fef2f2;
  color: #b91c1c;
}

.state.success {
  background: #ecfdf5;
  color: #047857;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.info-box {
  background: #f8fafc;
  border: 1px solid #dbe4f0;
  border-radius: 16px;
  padding: 14px 16px;
}

.info-box span,
.section-title {
  display: block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
  margin-bottom: 6px;
}

.info-box strong {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  word-break: break-word;
}

.upload-zone {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border-radius: 20px;
  border: 1px dashed #cbd5e1;
  background: #f8fafc;
  margin-bottom: 24px;
}

.hidden-input {
  display: none;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid #d1d9e6;
  background: #ffffff;
  color: #0f172a;
  border-radius: 14px;
  padding: 12px 18px;
  font-weight: 700;
  cursor: pointer;
}

.btn:hover {
  background: #f8fafc;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: #2563eb;
  color: #ffffff;
  border-color: #2563eb;
}

.btn-primary:hover {
  background: #1d4ed8;
}

.upload-hint {
  font-size: 14px;
  line-height: 1.6;
  color: #475569;
}

.selected-list {
  display: grid;
  gap: 8px;
}

.selected-item {
  padding: 10px 12px;
  border-radius: 12px;
  background: #ffffff;
  border: 1px solid #dbe4f0;
  color: #0f172a;
  font-size: 14px;
}

.files-section {
  margin-top: 8px;
}

.section-title {
  margin-bottom: 12px;
}

.empty {
  padding: 16px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 16px;
  color: #64748b;
}

.files-list {
  display: grid;
  gap: 10px;
}

.file-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid #dbe4f0;
  border-radius: 14px;
  background: #ffffff;
}

.file-date {
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .public-card {
    padding: 20px;
    border-radius: 20px;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .title {
    font-size: 24px;
  }

  .file-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
