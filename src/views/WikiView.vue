<script setup>
import { computed, onMounted, ref } from 'vue'
import TopNav from '../components/layout/TopNav.vue'
import { mainNavLinks } from '../constants/mainNav'

const navLinks = mainNavLinks

const wikiBase = (import.meta.env.VITE_WIKI_BASE_URL || '/wiki').replace(/\/+$/, '')
const wikiGraphqlUrl = `${wikiBase}/graphql`
const wikiToken = import.meta.env.VITE_WIKI_API_TOKEN || ''

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const pages = ref([])
const selectedId = ref(null)
const title = ref('')
const path = ref('')
const content = ref('')

const hasToken = computed(() => Boolean(String(wikiToken || '').trim()))
const selectedPage = computed(() => pages.value.find((p) => Number(p.id) === Number(selectedId.value)) || null)

const gql = async (query, variables = {}) => {
  const headers = { 'Content-Type': 'application/json' }
  if (hasToken.value) headers.Authorization = `Bearer ${wikiToken}`
  const res = await fetch(wikiGraphqlUrl, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Wiki API HTTP ${res.status}`)
  const json = await res.json()
  if (json?.errors?.length) throw new Error(json.errors[0]?.message || 'GraphQL error')
  return json?.data || {}
}

const loadPages = async () => {
  loading.value = true
  error.value = ''
  try {
    const data = await gql(`
      query {
        pages {
          list(orderBy: TITLE) {
            id
            title
            path
            updatedAt
          }
        }
      }
    `)
    pages.value = Array.isArray(data?.pages?.list) ? data.pages.list : []
    if (!selectedId.value && pages.value.length) {
      await selectPage(pages.value[0].id)
    }
  } catch (e) {
    error.value = `Не удалось загрузить страницы Wiki.js: ${e.message}`
  } finally {
    loading.value = false
  }
}

const selectPage = async (id) => {
  selectedId.value = Number(id)
  error.value = ''
  try {
    const data = await gql(`
      query($id: Int!) {
        pages {
          single(id: $id) {
            id
            title
            path
            content
          }
        }
      }
    `, { id: Number(id) })
    const page = data?.pages?.single
    title.value = page?.title || ''
    path.value = page?.path || ''
    content.value = page?.content || ''
  } catch (e) {
    error.value = `Не удалось загрузить страницу: ${e.message}`
  }
}

const createPage = async () => {
  saving.value = true
  error.value = ''
  try {
    const ts = Date.now()
    const newPath = `new-page-${ts}`
    const data = await gql(`
      mutation($content: String!, $description: String!, $editor: String!, $isPublished: Boolean!, $isPrivate: Boolean!, $locale: String!, $path: String!, $tags: [String], $title: String!) {
        pages {
          create(
            content: $content
            description: $description
            editor: $editor
            isPublished: $isPublished
            isPrivate: $isPrivate
            locale: $locale
            path: $path
            tags: $tags
            title: $title
          ) {
            responseResult { succeeded message }
            page { id title path }
          }
        }
      }
    `, {
      content: '# Новая страница',
      description: 'Создано из интерфейса supply',
      editor: 'markdown',
      isPublished: true,
      isPrivate: false,
      locale: 'ru',
      path: newPath,
      tags: ['supply'],
      title: `Новая страница ${ts}`,
    })
    const id = Number(data?.pages?.create?.page?.id || 0)
    await loadPages()
    if (id) await selectPage(id)
  } catch (e) {
    error.value = `Не удалось создать страницу: ${e.message}`
  } finally {
    saving.value = false
  }
}

const savePage = async () => {
  if (!selectedId.value) return
  saving.value = true
  error.value = ''
  try {
    await gql(`
      mutation($id: Int!, $content: String, $description: String, $editor: String, $isPrivate: Boolean, $isPublished: Boolean, $locale: String, $path: String, $tags: [String], $title: String) {
        pages {
          update(
            id: $id
            content: $content
            description: $description
            editor: $editor
            isPrivate: $isPrivate
            isPublished: $isPublished
            locale: $locale
            path: $path
            tags: $tags
            title: $title
          ) {
            responseResult { succeeded message }
            page { id updatedAt title path }
          }
        }
      }
    `, {
      id: Number(selectedId.value),
      content: String(content.value || ''),
      description: 'Обновлено из интерфейса supply',
      editor: 'markdown',
      isPrivate: false,
      isPublished: true,
      locale: 'ru',
      path: String(path.value || '').trim(),
      tags: ['supply'],
      title: String(title.value || '').trim(),
    })
    await loadPages()
  } catch (e) {
    error.value = `Не удалось сохранить страницу: ${e.message}`
  } finally {
    saving.value = false
  }
}

const openNativeWiki = () => {
  window.open(`${wikiBase}/`, '_blank', 'noopener')
}

onMounted(async () => {
  await loadPages()
})
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />
    <main class="main-content">
      <header class="head">
        <h1>Вики проекта</h1>
        <div class="head-actions">
          <button class="btn" type="button" @click="openNativeWiki">Открыть Wiki.js</button>
          <button class="btn btn-primary" type="button" :disabled="saving" @click="createPage">+ Страница</button>
          <button class="btn btn-primary" type="button" :disabled="saving || !selectedId" @click="savePage">{{ saving ? 'Сохранение...' : 'Сохранить' }}</button>
        </div>
      </header>

      <div v-if="error" class="error">{{ error }}</div>

      <div class="layout">
        <aside class="sidebar">
          <div class="side-title">Страницы</div>
          <div v-if="loading" class="muted">Загрузка...</div>
          <button
            v-for="p in pages"
            :key="p.id"
            class="page-item"
            :class="{ active: Number(selectedId) === Number(p.id) }"
            type="button"
            @click="selectPage(p.id)"
          >
            <div class="page-title">{{ p.title }}</div>
            <div class="page-path">{{ p.path }}</div>
          </button>
        </aside>

        <section class="editor">
          <label class="field">
            <span>Заголовок</span>
            <input v-model="title" type="text">
          </label>
          <label class="field">
            <span>Путь</span>
            <input v-model="path" type="text" placeholder="folder/page-name">
          </label>
          <label class="field grow">
            <span>Контент (Markdown)</span>
            <textarea v-model="content"></textarea>
          </label>
          <div class="muted">Для загрузки изображений/видео можно использовать “Открыть Wiki.js” (родной UI, Assets).</div>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page { height: 100%; display: flex; flex-direction: column; }
.main-content { flex: 1; min-height: 0; padding: 16px 22px; display: flex; flex-direction: column; gap: 10px; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.head h1 { margin: 0; font-size: 22px; }
.head-actions { display: flex; gap: 8px; }
.layout { flex: 1; min-height: 0; display: grid; grid-template-columns: 320px 1fr; gap: 10px; }
.sidebar { border: 1px solid var(--border-light); border-radius: 12px; background: var(--bg-surface); overflow: auto; padding: 10px; }
.side-title { font-size: 12px; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 8px; }
.page-item { width: 100%; text-align: left; padding: 8px; border-radius: 8px; border: 1px solid var(--border-light); background: var(--bg-subtle); margin-bottom: 6px; }
.page-item.active { border-color: var(--brand-primary); background: var(--brand-light); }
.page-title { font-size: 13px; color: var(--text-primary); }
.page-path { font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
.editor { border: 1px solid var(--border-light); border-radius: 12px; background: var(--bg-surface); padding: 10px; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text-secondary); }
.field input { height: 34px; border: 1px solid var(--border-light); border-radius: 8px; padding: 0 10px; }
.field textarea { width: 100%; height: 100%; min-height: 280px; border: 1px solid var(--border-light); border-radius: 8px; padding: 10px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.field.grow { flex: 1; min-height: 0; }
.muted { color: var(--text-secondary); font-size: 12px; }
.error { color: var(--danger-text); font-size: 12px; border: 1px solid #fecaca; background: #fff1f2; border-radius: 8px; padding: 8px 10px; }
</style>
