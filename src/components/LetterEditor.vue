<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Placeholder from '@tiptap/extension-placeholder'

const props = defineProps({
  letter:      { type: Object, required: true },
  letterId:    { type: [Number, String], required: true },
  mistralKey:  { type: String, default: '' },
})
const emit = defineEmits(['version-saved'])

// ── Форматирование ─────────────────────────────────────────
const formatDate = (v) => {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
}
const formatDateTime = (v) => {
  if (!v) return '—'
  return new Date(v).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const typeLabel = (t) => ({ outgoing: 'Исходящее', incoming: 'Входящее' }[t] || t || '')

// ── Данные шаблона ─────────────────────────────────────────
const tplData    = ref(null)
const tplLoading = ref(false)

const loadTemplateData = async () => {
  tplLoading.value = true
  try {
    const r = await fetch(`/apisup/supply/letters/${props.letterId}/template-data`, { credentials: 'include' })
    if (r.ok) tplData.value = await r.json()
  } catch {}
  finally { tplLoading.value = false }
}

// Удобные вычисляемые свойства
const tFrom  = computed(() => tplData.value?.from  || null)
const tWhere = computed(() => tplData.value?.where || null)
const tNum   = computed(() => tplData.value?.mailNum  || props.letter.internal_num || '')
const tDate  = computed(() => tplData.value?.mailDate || formatDate(props.letter.created_at))

// ── Поля «На №» и «от» (редактируемые) ────────────────────
const refNum  = ref('')
const refDate = ref('')  // хранится как YYYY-MM-DD (значение input[type=date])

// Форматируем дату для отображения в PDF/HTML: DD.MM.YYYY
const refDateFormatted = computed(() => {
  if (!refDate.value) return ''
  const [y, m, d] = refDate.value.split('-')
  return `${d}.${m}.${y}`
})

// ── Редактор ───────────────────────────────────────────────
const editor = useEditor({
  extensions: [
    StarterKit,
    Underline,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TextStyle,
    Color,
    Placeholder.configure({ placeholder: 'Начните писать текст письма...' }),
  ],
  content: '',
  editorProps: {
    attributes: { class: 'letter-body-editor' },
  },
})

// editor destroyed by useEditor's onBeforeUnmount

// ── Постраничная разбивка ──────────────────────────────────
const pageEl      = ref(null)   // ref на .le-page
const mmRulerEl   = ref(null)   // невидимый элемент высотой 297mm для измерения
const pageHeightPx = ref(1122)  // будет измерен точно
const pageTotalPx  = ref(0)     // реальная высота .le-page

const pageCount = computed(() =>
  Math.max(1, Math.ceil(pageTotalPx.value / pageHeightPx.value))
)
// Позиции линий разрыва (в px от верха .le-page)
const pageBreakLines = computed(() => {
  const lines = []
  for (let i = 1; i < pageCount.value; i++) {
    lines.push(i * pageHeightPx.value)
  }
  return lines
})

let pageRO = null
const measurePage = () => {
  if (mmRulerEl.value) {
    pageHeightPx.value = mmRulerEl.value.getBoundingClientRect().height
  }
  if (pageEl.value) {
    pageTotalPx.value = pageEl.value.getBoundingClientRect().height
  }
}

// ── Автосохранение ─────────────────────────────────────────
const saveStatus  = ref('') // '', 'saving', 'saved', 'error'
const saveTimer   = ref(null)
const lastContent = ref('')

watch(() => editor.value?.getHTML(), (html) => {
  if (!html || html === lastContent.value) return
  clearTimeout(saveTimer.value)
  saveStatus.value = ''
  saveTimer.value = setTimeout(() => autoSave(html), 30000) // 30 сек
})

const autoSave = async (html) => {
  if (!html || html === '<p></p>') return
  await saveVersion(html)
}

// ── Сохранение версии ─────────────────────────────────────
const saving = ref(false)
const saveVersion = async (html) => {
  if (saving.value) return
  saving.value    = true
  saveStatus.value = 'saving'
  try {
    const content = html || editor.value?.getHTML() || ''
    const blob = new Blob([buildDocHtml(content)], { type: 'text/html' })
    const file = new File([blob], buildFileName('html'), { type: 'text/html' })
    const formData = new FormData()
    formData.append('letter_id', props.letterId)
    formData.append('type', 'version')
    formData.append('files', file)

    // Находим или создаём папку «Версия письма»
    const foldersR = await fetch(`/apisup/supply/letter-folders?letter_id=${props.letterId}`, { credentials: 'include' })
    const folders  = foldersR.ok ? await foldersR.json() : []
    let folder = folders.find(f => f.name === 'Версия письма' && !f.parent_id)
    if (!folder) {
      const fr = await fetch('/apisup/supply/letter-folders', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letter_id: props.letterId, name: 'Версия письма', parent_id: null }),
      })
      folder = await fr.json()
    }
    formData.append('letter_folder_id', folder.id)

    const r = await fetch('/apisup/supply/letter-files', {
      method: 'POST', credentials: 'include', body: formData,
    })
    if (!r.ok) throw new Error()
    lastContent.value = content
    saveStatus.value  = 'saved'
    setTimeout(() => { saveStatus.value = '' }, 3000)
    emit('version-saved')
  } catch {
    saveStatus.value = 'error'
  } finally {
    saving.value = false
  }
}

const buildDocHtml = (body) => {
  const l  = props.letter
  const fr = tFrom.value
  const to = tWhere.value
  const num  = tNum.value
  const date = tDate.value

  const senderBlock = fr
    ? `<div class="sender-name">${fr.full_name || ''}</div>
       ${fr.legal_address ? `<div class="sender-line">${fr.legal_address}</div>` : ''}
       ${fr.phone         ? `<div class="sender-line">Тел.: ${fr.phone}</div>`          : ''}
       ${fr.email         ? `<div class="sender-line">E-mail: ${fr.email}</div>`        : ''}`
    : `<div class="sender-name">${l.from_to_name || ''}</div>`

  const recipientBlock = to
    ? `<div class="recipient-name">${to.full_name || ''}</div>
       ${to.fio_director ? `<div class="recipient-sub">${to.position || ''} ${to.fio_director}</div>` : ''}
       ${to.legal_address ? `<div class="recipient-sub">${to.legal_address}</div>` : ''}`
    : `<div class="recipient-name">${l.where_to_name || ''}</div>`

  const signatureBlock = fr
    ? `<div class="signature">
         <div class="sign-position">${fr.position || ''}</div>
         <div class="sign-line"></div>
         <div class="sign-name">${fr.fio_director || ''}</div>
       </div>`
    : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
* { box-sizing: border-box; }
body { font-family: 'Times New Roman', serif; font-size: 12pt; margin: 0; color: #111; }
.page { padding: 20mm 20mm 20mm 30mm; }
.letter-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8mm; gap: 10mm; }
.sender { flex: 1; }
.sender-name { font-size: 12pt; font-weight: bold; text-transform: uppercase; line-height: 1.3; margin-bottom: 3px; }
.sender-line { font-size: 10pt; color: #444; line-height: 1.5; }
.recipient { width: 78mm; flex-shrink: 0; }
.recipient-name { font-size: 12pt; font-weight: bold; line-height: 1.4; }
.recipient-sub { font-size: 10pt; color: #333; line-height: 1.4; margin-top: 2px; }
.ref-line { display: flex; align-items: baseline; gap: 4mm; border-top: 1px solid #555; border-bottom: 1px solid #555; padding: 3mm 0; margin-bottom: 8mm; font-size: 11pt; flex-wrap: wrap; }
.ref-val { border-bottom: 1px solid #333; min-width: 38mm; display: inline-block; padding: 0 3px; }
.body { line-height: 1.6; text-align: justify; }
.body p { margin: 0 0 6pt; }
.subject { text-align: center; font-weight: bold; font-size: 12pt; margin-bottom: 6mm; line-height: 1.4; }
.signature { margin-top: 16mm; display: flex; align-items: center; gap: 8mm; font-size: 11pt; }
.sign-position { white-space: nowrap; }
.sign-line { flex: 1; border-bottom: 1px solid #333; min-width: 40mm; }
.sign-name { white-space: nowrap; }
</style></head><body><div class="page">
<div class="letter-top">
  <div class="sender">${senderBlock}</div>
  <div class="recipient">${recipientBlock}</div>
</div>
<div class="ref-line">
  <span>${date}&nbsp;г.&nbsp;&nbsp;№</span>
  <span class="ref-val">&nbsp;${num}&nbsp;</span>
  <span style="margin-left:6mm">На №</span>
  <span class="ref-val">&nbsp;${refNum.value || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}&nbsp;</span>
  <span>от</span>
  <span class="ref-val">&nbsp;${refDateFormatted.value || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}&nbsp;</span>
</div>
${l.name ? `<div class="subject">${l.name}</div>` : ''}
<div class="body">${body}</div>
${signatureBlock}
</div></body></html>`
}

// ── Загрузка версии ────────────────────────────────────────
const versions        = ref([])
const versionsLoading = ref(false)
const activeVersion   = ref(null)

const loadVersions = async () => {
  versionsLoading.value = true
  try {
    const r = await fetch(`/apisup/supply/letter-files/history?letter_id=${props.letterId}`, { credentials: 'include' })
    const data = r.ok ? await r.json() : []
    versions.value = [...data].sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at))
  } finally {
    versionsLoading.value = false }
}

const loadVersionContent = async (file) => {
  activeVersion.value = file
  try {
    const r = await fetch(`/apisup/supply/letter-files/${file.id}/download`, { credentials: 'include' })
    if (!r.ok) return
    const html = await r.text()
    const match = html.match(/<div class="body">([\s\S]*?)<\/div>\s*<\/div>\s*<\/body>/)
    if (match) {
      editor.value?.commands.setContent(match[1])
      lastContent.value = editor.value?.getHTML() || ''
    }
  } catch {}
}

onMounted(() => {
  loadVersions()
  loadTemplateData()
  nextTick(() => {
    measurePage()
    pageRO = new ResizeObserver(measurePage)
    if (pageEl.value) pageRO.observe(pageEl.value)
  })
})
onBeforeUnmount(() => pageRO?.disconnect())

// ── AI ─────────────────────────────────────────────────────
const aiPrompt     = ref('')
const aiLoading    = ref(false)
const aiError      = ref('')
const aiPanelOpen  = ref(true)
const aiStreamText = ref('')   // живой текст во время стриминга

const aiSystemPrompt = computed(() => {
  const l  = props.letter
  const fr = tFrom.value
  const to = tWhere.value

  const senderInfo = fr
    ? `- Отправитель: ${fr.full_name}${fr.position ? `, ${fr.position}` : ''}${fr.fio_director ? ` ${fr.fio_director}` : ''}`
    : `- От кого: ${l.from_to_name || '—'}`

  const recipientInfo = to
    ? `- Получатель: ${to.full_name}${to.fio_director ? `\n- ФИО получателя: ${to.fio_director}` : ''}${to.position ? `\n- Должность получателя: ${to.position}` : ''}`
    : `- Кому: ${l.where_to_name || '—'}`

  const salutation = to?.fio_director
    ? `Уважаем${to.fio_director.trim().endsWith('а') || to.fio_director.trim().endsWith('на') ? 'ая' : 'ый'} ${to.fio_director}!`
    : to?.full_name ? `Уважаемые коллеги!` : `Уважаемый(-ая)!`

  return `Ты помощник для написания официальных деловых писем на русском языке.

Контекст письма:
- Тип: ${typeLabel(l.type)}
- Тема: ${l.name || '—'}
${senderInfo}
${recipientInfo}
- Номер письма: ${tNum.value || l.internal_num || '—'}

ПРАВИЛА ФОРМАТИРОВАНИЯ (используй HTML-теги, строго соблюдай):
1. Строка обращения — по центру, жирная: <p style="text-align:center;margin:0 0 4pt"><strong>${salutation}</strong></p>
2. Все остальные абзацы — по ширине, отступ между ними минимальный: <p style="text-align:justify;margin:0 0 4pt">текст абзаца</p>
3. Ключевые слова, суммы, даты, номера документов — выделяй <strong>жирным</strong>.
4. Списки: <ul style="margin:2pt 0;padding-left:18pt"><li style="margin:0">...</li></ul>
5. Пиши полный текст: обращение → основная часть → вежливое завершение (С уважением, / Просим рассмотреть, / и т.п.).
6. НЕ пиши шапку, реквизиты, подпись, дату — они автоматически добавляются шаблоном.
7. Стиль: официально-деловой, грамотный русский язык. Без лишних слов, конкретно и по делу.
8. Весь ответ — только HTML-фрагмент, без DOCTYPE, без <html>/<body>.`
})

const askAI = async () => {
  if (!aiPrompt.value.trim() || aiLoading.value) return
  aiLoading.value = true
  aiError.value   = ''

  // Вставляем курсор в конец и начинаем стриминг
  editor.value?.commands.focus('end')

  try {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${props.mistralKey}`,
      },
      body: JSON.stringify({
        model:    'mistral-large-latest',
        messages: [
          { role: 'system', content: aiSystemPrompt.value },
          { role: 'user',   content: aiPrompt.value },
        ],
        max_tokens:  2000,
        temperature: 0.7,
        stream:      true,
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let sseBuffer  = ''
    let fullText   = ''
    aiStreamText.value = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      sseBuffer += decoder.decode(value, { stream: true })
      const lines = sseBuffer.split('\n')
      sseBuffer = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') break
        try {
          const chunk = JSON.parse(data)
          const text = chunk.choices?.[0]?.delta?.content
          if (text) { fullText += text; aiStreamText.value += text }
        } catch {}
      }
    }

    // Вставляем результат в редактор как HTML
    if (fullText) {
      // Если AI вернул plain text без тегов — оборачиваем абзацы
      const html = fullText.includes('<p>') || fullText.includes('<strong>')
        ? fullText
        : fullText.split(/\n\n+/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')
      editor.value?.commands.focus('end')
      editor.value?.commands.insertContent(html)
      aiStreamText.value = ''
    }
  } catch (e) {
    aiError.value = e.message || 'Ошибка запроса к AI'
  } finally {
    aiLoading.value = false
  }
}

// ── Имя файла для сохранения ──────────────────────────────
const buildFileName = (ext) => {
  const name = props.letter.name || 'Письмо'
  const num  = tNum.value || props.letter.internal_num || ''
  const safe = (s) => s.replace(/[\\/:*?"<>|]/g, '_')
  return safe(`${name}${num ? ' № ' + num : ''}.${ext}`)
}

// ── Экспорт PDF ────────────────────────────────────────────
const exportPdf = () => {
  const html = buildDocHtml(editor.value?.getHTML() || '')
  const win = window.open('', '_blank')
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 500)
}

// ── Экспорт Word (.doc) ───────────────────────────────────
const exportWord = () => {
  const html = buildDocHtml(editor.value?.getHTML() || '')
  // Word открывает HTML напрямую через MIME application/msword
  const blob = new Blob(['﻿' + html], {
    type: 'application/vnd.ms-word;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = buildFileName('doc')
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="le-wrap">

    <!-- Тулбар -->
    <div class="le-toolbar" v-if="editor">
      <div class="le-toolbar-group">
        <button class="le-tb-btn" :class="{ active: editor.isActive('bold') }"
          @click="editor.chain().focus().toggleBold().run()" title="Жирный (Ctrl+B)">
          <b>Ж</b>
        </button>
        <button class="le-tb-btn" :class="{ active: editor.isActive('italic') }"
          @click="editor.chain().focus().toggleItalic().run()" title="Курсив (Ctrl+I)">
          <i>К</i>
        </button>
        <button class="le-tb-btn" :class="{ active: editor.isActive('underline') }"
          @click="editor.chain().focus().toggleUnderline().run()" title="Подчёркнутый (Ctrl+U)">
          <u>Ч</u>
        </button>
      </div>
      <div class="le-toolbar-sep"></div>
      <div class="le-toolbar-group">
        <button class="le-tb-btn" :class="{ active: editor.isActive({ textAlign: 'left' }) }"
          @click="editor.chain().focus().setTextAlign('left').run()" title="По левому краю">
          <i class="fas fa-align-left"></i>
        </button>
        <button class="le-tb-btn" :class="{ active: editor.isActive({ textAlign: 'center' }) }"
          @click="editor.chain().focus().setTextAlign('center').run()" title="По центру">
          <i class="fas fa-align-center"></i>
        </button>
        <button class="le-tb-btn" :class="{ active: editor.isActive({ textAlign: 'right' }) }"
          @click="editor.chain().focus().setTextAlign('right').run()" title="По правому краю">
          <i class="fas fa-align-right"></i>
        </button>
        <button class="le-tb-btn" :class="{ active: editor.isActive({ textAlign: 'justify' }) }"
          @click="editor.chain().focus().setTextAlign('justify').run()" title="По ширине">
          <i class="fas fa-align-justify"></i>
        </button>
      </div>
      <div class="le-toolbar-sep"></div>
      <div class="le-toolbar-group">
        <button class="le-tb-btn" :class="{ active: editor.isActive('bulletList') }"
          @click="editor.chain().focus().toggleBulletList().run()" title="Список">
          <i class="fas fa-list-ul"></i>
        </button>
        <button class="le-tb-btn" :class="{ active: editor.isActive('orderedList') }"
          @click="editor.chain().focus().toggleOrderedList().run()" title="Нумерованный список">
          <i class="fas fa-list-ol"></i>
        </button>
      </div>
      <div class="le-toolbar-sep"></div>
      <div class="le-toolbar-group">
        <button class="le-tb-btn" @click="editor.chain().focus().undo().run()" title="Отменить (Ctrl+Z)">
          <i class="fas fa-undo"></i>
        </button>
        <button class="le-tb-btn" @click="editor.chain().focus().redo().run()" title="Повторить (Ctrl+Y)">
          <i class="fas fa-redo"></i>
        </button>
      </div>
      <div class="le-toolbar-sep"></div>
      <div class="le-toolbar-group">
        <button class="le-tb-btn le-tb-btn--export" @click="exportPdf" title="Экспорт PDF">
          <i class="fas fa-file-pdf"></i> PDF
        </button>
        <button class="le-tb-btn le-tb-btn--export le-tb-btn--word" @click="exportWord" title="Экспорт Word">
          <i class="fas fa-file-word"></i> Word
        </button>
      </div>

      <div class="le-toolbar-spacer"></div>

      <!-- Статус сохранения -->
      <div class="le-save-status" :class="`le-save-status--${saveStatus}`">
        <template v-if="saveStatus === 'saving'">
          <div class="mini-spinner"></div> Сохранение...
        </template>
        <template v-else-if="saveStatus === 'saved'">
          <i class="fas fa-check-circle"></i> Сохранено
        </template>
        <template v-else-if="saveStatus === 'error'">
          <i class="fas fa-exclamation-circle"></i> Ошибка сохранения
        </template>
      </div>

      <button class="le-save-btn" :disabled="saving" @click="saveVersion()">
        <div v-if="saving" class="mini-spinner" style="border-top-color:#fff"></div>
        <i v-else class="fas fa-save"></i>
        Сохранить версию
      </button>
    </div>

    <div class="le-body">

      <!-- AI панель -->
      <div class="le-ai-panel" :class="{ 'le-ai-panel--collapsed': !aiPanelOpen }">
        <div class="le-ai-header" @click="aiPanelOpen = !aiPanelOpen">
          <div class="le-ai-title"><i class="fas fa-robot"></i> AI помощник</div>
          <i class="fas" :class="aiPanelOpen ? 'fa-chevron-left' : 'fa-chevron-right'"></i>
        </div>
        <div v-if="aiPanelOpen" class="le-ai-body">
          <div class="le-ai-ctx">
            <div class="le-ai-ctx-label">Контекст письма</div>
            <div class="le-ai-ctx-row"><span>Тема:</span> {{ letter.name || '—' }}</div>
            <div class="le-ai-ctx-row">
              <span>От:</span> {{ tFrom?.full_name || letter.from_to_name || '—' }}
            </div>
            <div class="le-ai-ctx-row">
              <span>Кому:</span> {{ tWhere?.full_name || letter.where_to_name || '—' }}
            </div>
            <div v-if="tWhere?.fio_director" class="le-ai-ctx-row">
              <span>Получатель:</span> {{ tWhere.position }} {{ tWhere.fio_director }}
            </div>
          </div>
          <div class="le-ai-label">Что написать?</div>
          <textarea class="le-ai-textarea" v-model="aiPrompt" rows="4"
            placeholder="Например: напиши вежливый отказ об увеличении арендной платы"
            @keydown.ctrl.enter="askAI"></textarea>
          <div class="le-ai-hint">Ctrl+Enter — отправить. AI напишет с обращением и форматированием.</div>
          <button class="le-ai-btn" :disabled="aiLoading || !aiPrompt.trim()" @click="askAI">
            <div v-if="aiLoading" class="mini-spinner" style="border-top-color:#fff"></div>
            <i v-else class="fas fa-magic"></i>
            {{ aiLoading ? 'Пишу письмо...' : 'Написать письмо' }}
          </button>
          <!-- Живое превью стриминга -->
          <div v-if="aiStreamText" class="le-ai-stream">
            <div class="le-ai-stream-label"><i class="fas fa-pen fa-xs"></i> Генерирую...</div>
            <div class="le-ai-stream-text">{{ aiStreamText }}</div>
          </div>
          <div v-if="aiError" class="le-ai-error"><i class="fas fa-exclamation-circle"></i> {{ aiError }}</div>
        </div>
      </div>

      <!-- Документ -->
      <div class="le-doc-wrap">
        <!-- Невидимый элемент для измерения 297mm в пикселях -->
        <div ref="mmRulerEl" style="position:absolute;visibility:hidden;pointer-events:none;height:297mm;width:0"></div>

        <div ref="pageEl" class="le-page" :style="pageCount > 1 ? 'padding-bottom: 16mm' : ''"
>

          <!-- Шапка письма (нередактируемая) -->

          <!-- Строка: отправитель слева, получатель справа -->
          <div class="le-top-row">
            <div class="le-sender">
              <div v-if="tplLoading" class="le-tpl-loading"><div class="mini-spinner"></div></div>
              <template v-else-if="tFrom">
                <div class="le-sender-name">{{ tFrom.full_name }}</div>
                <div v-if="tFrom.legal_address" class="le-sender-line">{{ tFrom.legal_address }}</div>
                <div v-if="tFrom.phone"         class="le-sender-line">Тел.: {{ tFrom.phone }}</div>
                <div v-if="tFrom.email"         class="le-sender-line">E-mail: {{ tFrom.email }}</div>
              </template>
              <div v-else class="le-sender-name">{{ letter.from_to_name || '—' }}</div>
            </div>
            <div class="le-recipient">
              <template v-if="tWhere">
                <div class="le-recipient-name">{{ tWhere.full_name }}</div>
                <div v-if="tWhere.fio_director" class="le-recipient-sub">
                  {{ tWhere.position }} {{ tWhere.fio_director }}
                </div>
                <div v-if="tWhere.legal_address" class="le-recipient-sub">{{ tWhere.legal_address }}</div>
              </template>
              <div v-else class="le-recipient-name">{{ letter.where_to_name || '—' }}</div>
            </div>
          </div>

          <!-- Строка: дата, номер, «На №» -->
          <div class="le-ref-row">
            <span class="le-ref-date">{{ tDate }}&nbsp;г.&nbsp;&nbsp;№</span>
            <span class="le-ref-num">{{ tNum }}</span>
            <span class="le-ref-sep">На №</span>
            <input class="le-ref-input" v-model="refNum" placeholder="__________" />
            <span class="le-ref-sep">от</span>
            <input class="le-ref-input le-ref-input--date" type="date" v-model="refDate" />
          </div>

          <!-- Тема по центру -->
          <div v-if="letter.name" class="le-subject-center">{{ letter.name }}</div>

          <div class="le-divider"></div>

          <!-- Редактируемое тело -->
          <EditorContent :editor="editor" class="le-editor-content" />

          <!-- Подпись отправителя -->
          <div v-if="tFrom?.fio_director || tFrom?.position" class="le-signature">
            <span class="le-sign-position">{{ tFrom?.position }}</span>
            <span class="le-sign-line"></span>
            <span class="le-sign-name">{{ tFrom?.fio_director }}</span>
          </div>

          <!-- Нумерация первой страницы (если страниц > 1) -->
          <div v-if="pageCount > 1" class="le-page-num le-page-num--first">1</div>

          <!-- Разрывы страниц и нумерация -->
          <div
            v-for="(pos, i) in pageBreakLines"
            :key="i"
            class="le-page-break"
            :style="{ top: pos + 'px' }"
            aria-hidden="true"
          >
            <span class="le-page-break-label">{{ i + 1 }}</span>
            <span class="le-page-break-line"></span>
            <span class="le-page-break-label">{{ i + 2 }}</span>
          </div>

        </div>
      </div>

      <!-- Версии -->
      <div class="le-versions">
        <div class="le-ver-header">
          <i class="fas fa-history"></i> Версии
          <button class="le-ver-refresh" @click="loadVersions" title="Обновить">
            <i class="fas fa-sync-alt" :class="{ 'fa-spin': versionsLoading }"></i>
          </button>
        </div>
        <div class="le-ver-list">
          <div v-if="versionsLoading" class="le-ver-empty">
            <div class="mini-spinner"></div>
          </div>
          <div v-else-if="!versions.length" class="le-ver-empty">
            <i class="fas fa-clock" style="font-size:22px;color:var(--border-light);margin-bottom:6px"></i>
            <span>Версий пока нет</span>
          </div>
          <div v-else>
            <div v-for="(file, idx) in versions" :key="file.id"
              class="le-ver-item" :class="{ 'le-ver-item--active': activeVersion?.id === file.id }"
              @click="loadVersionContent(file)">
              <div class="le-ver-top">
                <span class="le-ver-num">v{{ versions.length - idx }}</span>
                <span v-if="idx === 0" class="le-ver-badge le-ver-badge--new">Новая</span>
              </div>
              <div class="le-ver-date"><i class="fas fa-calendar-alt"></i> {{ formatDateTime(file.uploaded_at) }}</div>
              <div v-if="file.uploaded_by_user" class="le-ver-author">
                <div class="le-ver-avatar">{{ file.uploaded_by_user?.name?.[0] }}{{ file.uploaded_by_user?.surname?.[0] }}</div>
                {{ file.uploaded_by_user?.short_fio }}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.le-wrap { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; background: var(--bg-page); }

/* ── Тулбар ── */
.le-toolbar { display: flex; align-items: center; gap: 2px; padding: 6px 12px; background: var(--bg-surface); border-bottom: 1px solid var(--border-light); flex-shrink: 0; flex-wrap: wrap; }
.le-toolbar-group { display: flex; align-items: center; gap: 1px; }
.le-toolbar-sep { width: 1px; height: 20px; background: var(--border-light); margin: 0 6px; }
.le-toolbar-spacer { flex: 1; }
.le-tb-btn { width: 30px; height: 28px; border: none; background: transparent; border-radius: 5px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 13px; color: var(--text-secondary); transition: background .1s, color .1s; }
.le-tb-btn:hover { background: var(--bg-subtle); color: var(--text-primary); }
.le-tb-btn.active { background: color-mix(in srgb, var(--brand-primary) 12%, transparent); color: var(--brand-primary); }
.le-tb-btn--export { width: auto; padding: 0 10px; gap: 5px; color: #dc2626; font-size: 12px; font-weight: 600; }
.le-tb-btn--export:hover { background: #fef2f2; }
.le-tb-btn--word { color: #1d6ae5; }
.le-tb-btn--word:hover { background: #eff6ff; }
.le-save-status { display: flex; align-items: center; gap: 6px; font-size: 12px; padding: 0 8px; }
.le-save-status--saving { color: var(--text-tertiary); }
.le-save-status--saved  { color: #16a34a; }
.le-save-status--error  { color: #ef4444; }
.le-save-btn { padding: 6px 14px; background: var(--brand-primary); color: #fff; border: none; border-radius: var(--radius-md); font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: opacity .15s; margin-left: 6px; }
.le-save-btn:hover:not(:disabled) { opacity: .88; }
.le-save-btn:disabled { opacity: .5; cursor: default; }

/* ── Body ── */
.le-body { flex: 1; display: flex; overflow: hidden; }

/* ── AI панель ── */
.le-ai-panel { width: 280px; flex-shrink: 0; border-right: 1px solid var(--border-light); background: var(--bg-surface); display: flex; flex-direction: column; overflow: hidden; transition: width .2s; }
.le-ai-panel--collapsed { width: 36px; }
.le-ai-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--border-light); flex-shrink: 0; user-select: none; gap: 8px; }
.le-ai-header:hover { background: var(--bg-subtle); }
.le-ai-title { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; }
.le-ai-title i { color: #7c3aed; }
.le-ai-header > .fas { color: var(--text-tertiary); font-size: 10px; flex-shrink: 0; }
.le-ai-body { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.le-ai-ctx { background: var(--bg-subtle); border: 1px solid var(--border-light); border-radius: var(--radius-md); padding: 9px 11px; }
.le-ai-ctx-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--text-tertiary); margin-bottom: 5px; }
.le-ai-ctx-row { font-size: 11px; color: var(--text-secondary); line-height: 1.5; }
.le-ai-ctx-row span { font-weight: 600; color: var(--text-primary); }
.le-ai-label { font-size: 11px; font-weight: 600; color: var(--text-secondary); }
.le-ai-textarea { width: 100%; box-sizing: border-box; border: 1.5px solid var(--border-light); border-radius: var(--radius-md); padding: 8px 10px; font-size: 12px; color: var(--text-primary); background: var(--bg-page); resize: vertical; min-height: 80px; outline: none; font-family: inherit; line-height: 1.5; }
.le-ai-textarea:focus { border-color: #7c3aed; }
.le-ai-hint { font-size: 10px; color: var(--text-tertiary); margin-top: -4px; }
.le-ai-btn { width: 100%; padding: 8px; background: #7c3aed; color: #fff; border: none; border-radius: var(--radius-md); font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: opacity .15s; }
.le-ai-btn:hover:not(:disabled) { opacity: .88; }
.le-ai-btn:disabled { opacity: .5; cursor: default; }
.le-ai-error { font-size: 11px; color: #ef4444; display: flex; align-items: flex-start; gap: 5px; }
.le-ai-stream { border: 1px solid #e9d5ff; border-radius: var(--radius-md); overflow: hidden; }
.le-ai-stream-label { background: #f5f3ff; padding: 5px 10px; font-size: 10px; font-weight: 700; color: #7c3aed; display: flex; align-items: center; gap: 5px; }
.le-ai-stream-text { padding: 8px 10px; font-size: 11px; color: var(--text-secondary); line-height: 1.5; max-height: 120px; overflow-y: auto; white-space: pre-wrap; word-break: break-word; }

/* ── Документ ── */
.le-doc-wrap { flex: 1; overflow-y: auto; padding: 24px; background: #e8e8e8; display: flex; justify-content: center; align-items: flex-start; }
.le-page { width: 210mm; min-height: 297mm; background: #fff; box-shadow: 0 2px 16px rgba(0,0,0,.15); padding: 20mm 20mm 20mm 30mm; box-sizing: border-box; position: relative; }

/* ── Разрывы страниц ── */
.le-page-break {
  position: absolute;
  left: 0; right: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
  z-index: 10;
  /* сдвигаем вверх на половину высоты блока чтобы линия была по центру */
  transform: translateY(-50%);
}
.le-page-break-line {
  flex: 1;
  border-top: 2px dashed #60a5fa;
}
.le-page-break-label {
  font-size: 10px;
  font-weight: 700;
  color: #3b82f6;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  padding: 1px 7px;
  white-space: nowrap;
  flex-shrink: 0;
}
/* Номер первой страницы — прилипает к низу страницы */
.le-page-num--first {
  position: absolute;
  bottom: 8mm;
  left: 0; right: 0;
  text-align: center;
  font-size: 10pt;
  color: #888;
  font-family: 'Times New Roman', serif;
  pointer-events: none;
}

/* ── Шапка письма ── */
.le-top-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8mm; gap: 10mm; }
.le-sender { flex: 1; }
.le-sender-name { font-family: 'Times New Roman', serif; font-size: 12pt; font-weight: 700; text-transform: uppercase; line-height: 1.35; color: #111; margin-bottom: 3px; }
.le-sender-line { font-family: 'Times New Roman', serif; font-size: 10pt; color: #444; line-height: 1.5; }
.le-tpl-loading { display: flex; align-items: center; gap: 6px; color: var(--text-tertiary); font-size: 11px; }
.le-recipient { width: 78mm; flex-shrink: 0; }
.le-recipient-name { font-family: 'Times New Roman', serif; font-size: 12pt; font-weight: 700; line-height: 1.4; color: #111; }
.le-recipient-sub { font-family: 'Times New Roman', serif; font-size: 10pt; color: #333; line-height: 1.45; margin-top: 2px; }
.le-ref-row { display: flex; align-items: center; gap: 4px; border-top: 1px solid #555; border-bottom: 1px solid #555; padding: 3px 0; margin-bottom: 8mm; font-family: 'Times New Roman', serif; font-size: 10pt; flex-wrap: nowrap; }
.le-ref-date { white-space: nowrap; flex-shrink: 0; }
.le-ref-num { border-bottom: 1px solid #333; min-width: 22mm; padding: 0 3px; color: #222; flex-shrink: 0; font-size: 10pt; }
.le-ref-sep { white-space: nowrap; flex-shrink: 0; margin-left: 4mm; color: #333; }
.le-ref-input { border: none; border-bottom: 1.5px solid #666; background: transparent; font-family: 'Times New Roman', serif; font-size: 10pt; color: #111; min-width: 22mm; max-width: 28mm; padding: 0 2px; outline: none; line-height: 1.4; flex-shrink: 0; }
.le-ref-input:focus { border-bottom-color: #1d4ed8; }
.le-ref-input--date { min-width: 30mm; max-width: 34mm; cursor: pointer; color-scheme: light; }
.le-ref-input--date::-webkit-calendar-picker-indicator { opacity: 0.5; cursor: pointer; width: 12px; height: 12px; }
.le-subject-center { text-align: center; font-family: 'Times New Roman', serif; font-size: 12pt; font-weight: 700; margin-bottom: 6mm; line-height: 1.4; }
.le-divider { border-top: 1px solid #ddd; margin: 6px 0 14px; }
/* ── Подпись ── */
.le-signature { display: flex; align-items: flex-end; gap: 8mm; margin-top: 16mm; font-family: 'Times New Roman', serif; font-size: 11pt; color: #111; }
.le-sign-position { white-space: nowrap; flex-shrink: 0; }
.le-sign-line { flex: 1; border-bottom: 1px solid #333; min-width: 40mm; margin-bottom: 2px; }
.le-sign-name { white-space: nowrap; flex-shrink: 0; }

/* ── Редактор TipTap ── */
.le-editor-content { outline: none; }
:deep(.letter-body-editor) {
  font-family: 'Times New Roman', serif;
  font-size: 12pt;
  line-height: 1.6;
  color: #111;
  min-height: 120px;
  outline: none;
}
:deep(.letter-body-editor p) { margin: 0 0 4pt; text-align: justify; }
:deep(.letter-body-editor ul), :deep(.letter-body-editor ol) { padding-left: 18pt; margin: 2pt 0; }
:deep(.letter-body-editor li) { margin: 0; }
:deep(.letter-body-editor .is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: #aaa;
  pointer-events: none;
  position: absolute;
  font-style: italic;
}
:deep(.letter-body-editor p.is-empty::before) {
  content: attr(data-placeholder);
  color: #bbb;
  pointer-events: none;
  float: left;
  height: 0;
  font-style: italic;
}

/* ── Версии ── */
.le-versions { width: 220px; flex-shrink: 0; border-left: 1px solid var(--border-light); background: var(--bg-surface); display: flex; flex-direction: column; overflow: hidden; }
.le-ver-header { display: flex; align-items: center; gap: 7px; padding: 10px 12px; border-bottom: 1px solid var(--border-light); font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .05em; flex-shrink: 0; }
.le-ver-header i { color: var(--brand-primary); }
.le-ver-refresh { margin-left: auto; background: none; border: none; cursor: pointer; color: var(--text-tertiary); font-size: 11px; padding: 2px 4px; }
.le-ver-refresh:hover { color: var(--brand-primary); }
.le-ver-list { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.le-ver-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--text-tertiary); font-size: 12px; padding: 24px 0; text-align: center; }
.le-ver-item { padding: 9px 11px; border: 1.5px solid var(--border-light); border-radius: var(--radius-md); cursor: pointer; transition: border-color .15s, background .15s; display: flex; flex-direction: column; gap: 4px; }
.le-ver-item:hover { border-color: var(--brand-primary); background: color-mix(in srgb, var(--brand-primary) 4%, transparent); }
.le-ver-item--active { border-color: var(--brand-primary); background: color-mix(in srgb, var(--brand-primary) 8%, transparent); }
.le-ver-top { display: flex; align-items: center; gap: 6px; }
.le-ver-num { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.le-ver-badge { padding: 1px 7px; border-radius: 10px; font-size: 10px; font-weight: 700; }
.le-ver-badge--new { background: #dcfce7; color: #15803d; }
.le-ver-date { font-size: 11px; color: var(--text-tertiary); display: flex; align-items: center; gap: 4px; }
.le-ver-author { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-secondary); }
.le-ver-avatar { width: 16px; height: 16px; border-radius: 50%; background: var(--brand-primary); color: #fff; font-size: 7px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

/* ── Утилиты ── */
.mini-spinner { width: 14px; height: 14px; border: 2px solid var(--border-light); border-top-color: var(--brand-primary); border-radius: 50%; animation: spin .7s linear infinite; flex-shrink: 0; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
