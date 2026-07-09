<script setup>
import { computed, nextTick, ref } from 'vue'

const props = defineProps({
  html: { type: String, default: '' },
  api: { type: String, default: '/apisup/supply/wiki' },
  dark: { type: Boolean, default: false },
})
const emit = defineEmits(['save', 'cancel'])

// ── Типы блоков ──
const TYPES = [
  { type: 'paragraph', label: 'Текст', icon: 'fa-paragraph' },
  { type: 'h2', label: 'Заголовок', icon: 'fa-heading' },
  { type: 'h3', label: 'Подзаголовок', icon: 'fa-heading' },
  { type: 'bulleted', label: 'Маркированный список', icon: 'fa-list-ul' },
  { type: 'numbered', label: 'Нумерованный список', icon: 'fa-list-ol' },
  { type: 'quote', label: 'Цитата', icon: 'fa-quote-left' },
  { type: 'callout-info', label: 'Блок «Важно»', icon: 'fa-circle-info' },
  { type: 'callout-warn', label: 'Блок «Предупреждение»', icon: 'fa-triangle-exclamation' },
  { type: 'divider', label: 'Разделитель', icon: 'fa-minus' },
  { type: 'image', label: 'Изображение', icon: 'fa-image' },
  { type: 'video', label: 'Видео', icon: 'fa-film' },
]
const uid = () => 'b-' + Math.random().toString(36).slice(2, 9)

// ── Парсинг входного HTML в блоки ──
const fromHtml = (html) => {
  const blocks = []
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  const push = (type, extra = {}) => blocks.push({ id: uid(), type, html: '', src: '', ...extra })
  for (const node of doc.body.childNodes) {
    if (node.nodeType === 3) { const t = node.textContent.trim(); if (t) push('paragraph', { html: t }); continue }
    if (node.nodeType !== 1) continue
    const el = node, tag = el.tagName.toLowerCase()
    if (tag === 'h2') push('h2', { html: el.innerHTML })
    else if (tag === 'h3') push('h3', { html: el.innerHTML })
    else if (tag === 'blockquote') push('quote', { html: el.innerHTML })
    else if (tag === 'ul') el.querySelectorAll(':scope > li').forEach(li => push('bulleted', { html: li.innerHTML }))
    else if (tag === 'ol') el.querySelectorAll(':scope > li').forEach(li => push('numbered', { html: li.innerHTML }))
    else if (tag === 'hr') push('divider')
    else if (tag === 'img') push('image', { src: el.getAttribute('src') })
    else if (tag === 'video') push('video', { src: el.getAttribute('src') || el.querySelector('source')?.getAttribute('src') })
    else if (el.classList?.contains('cx-callout')) {
      const warn = el.classList.contains('cx-callout--warn')
      const inner = el.querySelector('div')
      push(warn ? 'callout-warn' : 'callout-info', { html: inner ? inner.innerHTML : el.innerHTML })
    } else push('paragraph', { html: el.innerHTML })
  }
  if (!blocks.length) push('paragraph')
  return blocks
}

// ── Сериализация блоков в HTML ──
const toHtml = (bs) => {
  let html = '', buf = '', listTag = ''
  const flush = () => { if (listTag) { html += `<${listTag}>${buf}</${listTag}>`; buf = ''; listTag = '' } }
  for (const b of bs) {
    if (b.type === 'bulleted' || b.type === 'numbered') {
      const t = b.type === 'bulleted' ? 'ul' : 'ol'
      if (listTag && listTag !== t) flush()
      listTag = t; buf += `<li>${b.html || ''}</li>`; continue
    }
    flush()
    if (b.type === 'h2') html += `<h2>${b.html || ''}</h2>`
    else if (b.type === 'h3') html += `<h3>${b.html || ''}</h3>`
    else if (b.type === 'quote') html += `<blockquote>${b.html || ''}</blockquote>`
    else if (b.type === 'callout-info') html += `<div class="cx-callout cx-callout--info"><i class="fas fa-circle-info"></i><div>${b.html || ''}</div></div>`
    else if (b.type === 'callout-warn') html += `<div class="cx-callout cx-callout--warn"><i class="fas fa-triangle-exclamation"></i><div>${b.html || ''}</div></div>`
    else if (b.type === 'divider') html += '<hr />'
    else if (b.type === 'image') html += `<img src="${b.src}" alt="" />`
    else if (b.type === 'video') html += `<video src="${b.src}" controls></video>`
    else html += `<p>${b.html || ''}</p>`
  }
  flush()
  return html
}

const blocks = ref(fromHtml(props.html))

// нумерация для нумерованных списков
const numberOf = (b) => {
  let n = 0
  for (const x of blocks.value) {
    if (x.type === 'numbered') { n++; if (x.id === b.id) return n } else n = 0
  }
  return 1
}

// ── DOM-элементы блоков ──
const elMap = new Map()
const setEl = (b) => (el) => {
  if (!el) { elMap.delete(b.id); return }
  elMap.set(b.id, el)
  if (el.dataset.init !== '1') { el.innerHTML = b.html || ''; el.dataset.init = '1' }
}
const onInput = (b, e) => { b.html = e.target.innerHTML }

// ── Каретка ──
const setCaret = (el, offset) => {
  el.focus()
  const sel = window.getSelection(), range = document.createRange()
  if (offset === 'end') { range.selectNodeContents(el); range.collapse(false) }
  else {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node, count = 0, done = false
    while ((node = walker.nextNode())) {
      const len = node.textContent.length
      if (count + len >= offset) { range.setStart(node, offset - count); done = true; break }
      count += len
    }
    if (!done) { range.selectNodeContents(el); range.collapse(false) } else range.collapse(true)
  }
  sel.removeAllRanges(); sel.addRange(range)
}
const focusBlock = (id, offset = 'end') => nextTick(() => { const el = elMap.get(id); if (el) setCaret(el, offset) })

const caretAtStart = (el) => {
  const sel = window.getSelection()
  if (!sel.rangeCount) return false
  const range = sel.getRangeAt(0)
  if (!range.collapsed) return false
  const pre = range.cloneRange(); pre.selectNodeContents(el); pre.setEnd(range.startContainer, range.startOffset)
  return pre.toString().length === 0
}
const splitAfterCaret = (el) => {
  const sel = window.getSelection()
  if (!sel.rangeCount) return ''
  const range = sel.getRangeAt(0)
  const tail = range.cloneRange(); tail.selectNodeContents(el); tail.setStart(range.endContainer, range.endOffset)
  const frag = tail.extractContents()
  const tmp = document.createElement('div'); tmp.appendChild(frag)
  return tmp.innerHTML
}
const isEmpty = (b) => !b.html || !b.html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim()

const indexOf = (b) => blocks.value.findIndex(x => x.id === b.id)
const insertAfter = (i, block) => blocks.value.splice(i + 1, 0, block)
const removeAt = (i) => blocks.value.splice(i, 1)

// ── Клавиатура ──
const onKeydown = (b, e) => {
  const el = elMap.get(b.id)
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    const i = indexOf(b)
    // выход из списка по Enter на пустом пункте
    if ((b.type === 'bulleted' || b.type === 'numbered') && isEmpty(b)) {
      b.type = 'paragraph'; el.innerHTML = ''; return
    }
    const after = splitAfterCaret(el)
    b.html = el.innerHTML
    const keepType = (b.type === 'bulleted' || b.type === 'numbered') ? b.type : 'paragraph'
    const nb = { id: uid(), type: keepType, html: after, src: '' }
    insertAfter(i, nb)
    focusBlock(nb.id, after ? 0 : 'end')
    return
  }
  if (e.key === 'Backspace' && caretAtStart(el)) {
    const i = indexOf(b)
    if (i === 0) {
      if (b.type !== 'paragraph') { e.preventDefault(); b.type = 'paragraph' }
      return
    }
    const prev = blocks.value[i - 1]
    e.preventDefault()
    if (prev.type === 'divider' || prev.type === 'image') { removeAt(i - 1); return }
    const prevEl = elMap.get(prev.id)
    const offset = (prevEl.textContent || '').length
    prevEl.innerHTML = (prevEl.innerHTML || '') + (el.innerHTML || '')
    prev.html = prevEl.innerHTML
    removeAt(i)
    focusBlock(prev.id, offset)
    return
  }
}

// ── Позиционирование меню в пределах экрана ──
const clampMenu = (menuRef, refEl) => {
  nextTick(() => {
    const el = menuRef.value
    if (!el) return
    const m = el.getBoundingClientRect()
    const r = refEl.getBoundingClientRect()
    const gap = 6, pad = 8
    let x = r.right + gap
    if (x + m.width > window.innerWidth - pad) x = r.left - m.width - gap // слева от кнопки
    if (x < pad) x = pad
    let y = r.top
    if (y + m.height > window.innerHeight - pad) y = window.innerHeight - m.height - pad // вверх
    if (y < pad) y = pad
    el.style.left = x + 'px'
    el.style.top = y + 'px'
  })
}

// ── Меню добавления блока ──
const addMenuEl = ref(null)
const addMenu = ref({ open: false, x: 0, y: 0, afterId: null })
const openAddMenu = (b, e) => {
  const el = e.currentTarget
  addMenu.value = { open: true, x: el.getBoundingClientRect().right + 6, y: el.getBoundingClientRect().top, afterId: b.id }
  clampMenu(addMenuEl, el)
}
const closeAddMenu = () => { addMenu.value.open = false }
const imageInput = ref(null)
const videoInput = ref(null)
const pendingAfter = ref(null)
const pendingKind = ref('image')

const addBlock = (type) => {
  const i = blocks.value.findIndex(x => x.id === addMenu.value.afterId)
  closeAddMenu()
  if (type === 'image' || type === 'video') {
    pendingAfter.value = i; pendingKind.value = type
    ;(type === 'image' ? imageInput : videoInput).value?.click(); return
  }
  if (type === 'divider') {
    insertAfter(i, { id: uid(), type: 'divider', html: '', src: '' })
    const p = { id: uid(), type: 'paragraph', html: '', src: '' }
    insertAfter(i + 1, p); focusBlock(p.id); return
  }
  const prefill = type === 'callout-info' ? '<strong>Важно.</strong>&nbsp;'
    : type === 'callout-warn' ? '<strong>Предупреждение.</strong>&nbsp;' : ''
  const nb = { id: uid(), type, html: prefill, src: '' }
  insertAfter(i, nb)
  focusBlock(nb.id)
}

// ── Меню блока (удалить / дублировать) ──
const blockMenuEl = ref(null)
const blockMenu = ref({ open: false, x: 0, y: 0, id: null })
const openBlockMenu = (b, e) => {
  dragId.value = null
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  blockMenu.value = { open: true, x: r.right + 6, y: r.top, id: b.id }
  clampMenu(blockMenuEl, el)
}
const closeBlockMenu = () => { blockMenu.value.open = false }
const deleteBlock = () => {
  const i = blocks.value.findIndex(x => x.id === blockMenu.value.id)
  closeBlockMenu()
  if (i < 0) return
  removeAt(i)
  if (!blocks.value.length) blocks.value.push({ id: uid(), type: 'paragraph', html: '', src: '' })
  const focus = blocks.value[i - 1] || blocks.value[i]
  if (focus) focusBlock(focus.id)
}
const duplicateBlock = () => {
  const i = blocks.value.findIndex(x => x.id === blockMenu.value.id)
  closeBlockMenu()
  if (i < 0) return
  const src = blocks.value[i]
  const el = elMap.get(src.id)
  if (el) src.html = el.innerHTML
  insertAfter(i, { ...src, id: uid() })
}

const onFile = async (e) => {
  const file = e.target.files?.[0]; e.target.value = ''
  if (!file) return
  const fd = new FormData(); fd.append('file', file)
  try {
    const r = await fetch(`${props.api}/upload`, { method: 'POST', credentials: 'include', body: fd })
    if (r.ok) {
      const d = await r.json()
      const i = pendingAfter.value ?? blocks.value.length - 1
      insertAfter(i, { id: uid(), type: pendingKind.value, html: '', src: d.url })
      const p = { id: uid(), type: 'paragraph', html: '', src: '' }
      insertAfter(i + 1, p); focusBlock(p.id)
    }
  } catch { /* ignore */ }
}

// ── Перетаскивание блоков ──
const dragId = ref(null)
const dropTarget = ref({ id: null, pos: '' })
const armDrag = (b) => { dragId.value = b.id }
const onDragOver = (b, e) => {
  if (!dragId.value) return
  e.preventDefault()
  const r = e.currentTarget.getBoundingClientRect()
  dropTarget.value = { id: b.id, pos: (e.clientY - r.top) < r.height / 2 ? 'before' : 'after' }
}
const onDrop = () => {
  const { id, pos } = dropTarget.value
  const from = blocks.value.findIndex(x => x.id === dragId.value)
  dropTarget.value = { id: null, pos: '' }
  if (from < 0 || !id || id === dragId.value) { dragId.value = null; return }
  const moved = blocks.value.splice(from, 1)[0]
  let to = blocks.value.findIndex(x => x.id === id)
  if (pos === 'after') to++
  blocks.value.splice(to, 0, moved)
  dragId.value = null
}

// ── Инлайн-форматирование ──
const exec = (cmd, val = null) => document.execCommand(cmd, false, val)
const addLink = () => { const url = prompt('URL ссылки:'); if (url) exec('createLink', url) }

// ── Сохранение ──
const save = () => { blocks.value.forEach(b => { const el = elMap.get(b.id); if (el) b.html = el.innerHTML }); emit('save', { html: toHtml(blocks.value), blocks: blocks.value }) }

const isCallout = (t) => t === 'callout-info' || t === 'callout-warn'
</script>

<template>
  <div class="be" @click="closeAddMenu(); closeBlockMenu()">
    <!-- Инлайн-панель -->
    <div class="be-toolbar" @mousedown.prevent>
      <button title="Жирный" @click="exec('bold')"><i class="fas fa-bold"></i></button>
      <button title="Курсив" @click="exec('italic')"><i class="fas fa-italic"></i></button>
      <button title="Подчёркнутый" @click="exec('underline')"><i class="fas fa-underline"></i></button>
      <button title="Ссылка" @click="addLink"><i class="fas fa-link"></i></button>
    </div>

    <!-- Блоки -->
    <div class="be-doc">
      <div
        v-for="b in blocks" :key="b.id"
        class="be-block" :class="{ ['drop-' + dropTarget.pos]: dropTarget.id === b.id, dragging: dragId === b.id }"
        :draggable="dragId === b.id"
        @dragover="onDragOver(b, $event)" @drop.prevent="onDrop" @dragend="dragId = null"
      >
        <div class="be-gutter">
          <button class="be-g-btn" title="Добавить блок" @click.stop="openAddMenu(b, $event)"><i class="fas fa-plus"></i></button>
          <button class="be-g-btn be-handle" title="Перетащить / меню" @mousedown="armDrag(b)" @click.stop="openBlockMenu(b, $event)"><i class="fas fa-grip-vertical"></i></button>
        </div>

        <!-- Разделитель -->
        <hr v-if="b.type === 'divider'" class="be-hr" />
        <!-- Изображение -->
        <div v-else-if="b.type === 'image'" class="be-img"><img :src="b.src" alt="" /></div>
        <!-- Видео -->
        <div v-else-if="b.type === 'video'" class="be-video"><video :src="b.src" controls></video></div>
        <!-- Callout -->
        <div v-else-if="isCallout(b.type)" class="be-callout" :class="b.type === 'callout-warn' ? 'warn' : 'info'">
          <i class="fas" :class="b.type === 'callout-warn' ? 'fa-triangle-exclamation' : 'fa-circle-info'"></i>
          <div :ref="setEl(b)" class="be-edit" contenteditable="true"
            @input="onInput(b, $event)" @keydown="onKeydown(b, $event)"></div>
        </div>
        <!-- Список -->
        <div v-else-if="b.type === 'bulleted' || b.type === 'numbered'" class="be-li">
          <span class="be-marker">{{ b.type === 'numbered' ? numberOf(b) + '.' : '•' }}</span>
          <div :ref="setEl(b)" class="be-edit" contenteditable="true"
            @input="onInput(b, $event)" @keydown="onKeydown(b, $event)"></div>
        </div>
        <!-- Текст/заголовки/цитата -->
        <div v-else :ref="setEl(b)" class="be-edit" :class="'be-' + b.type"
          :data-ph="b.type === 'h2' ? 'Заголовок' : b.type === 'h3' ? 'Подзаголовок' : 'Введите текст, «+» — добавить блок…'"
          contenteditable="true" @input="onInput(b, $event)" @keydown="onKeydown(b, $event)"></div>
      </div>
    </div>

    <input ref="imageInput" type="file" accept="image/*" hidden @change="onFile" />
    <input ref="videoInput" type="file" accept="video/*" hidden @change="onFile" />

    <div class="be-actions">
      <button class="be-btn ghost" @click="emit('cancel')">Отмена</button>
      <button class="be-btn primary" @click="save">Сохранить</button>
    </div>

    <!-- Меню добавления -->
    <Teleport to="body">
      <div v-if="addMenu.open" ref="addMenuEl" class="be-menu" :class="{ dark }" :style="{ left: addMenu.x + 'px', top: addMenu.y + 'px' }" @click.stop>
        <button v-for="t in TYPES" :key="t.type" @click="addBlock(t.type)">
          <i class="fas" :class="t.icon"></i> {{ t.label }}
        </button>
      </div>
    </Teleport>

    <!-- Меню блока -->
    <Teleport to="body">
      <div v-if="blockMenu.open" ref="blockMenuEl" class="be-menu" :class="{ dark }" :style="{ left: blockMenu.x + 'px', top: blockMenu.y + 'px' }" @click.stop>
        <button @click="duplicateBlock"><i class="fas fa-clone"></i> Дублировать</button>
        <button class="danger" @click="deleteBlock"><i class="fas fa-trash"></i> Удалить</button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.be-toolbar { position: sticky; top: 0; z-index: 5; display: flex; gap: 2px; padding: 6px; margin-bottom: 16px; border: 1px solid var(--wk-border); border-radius: 12px; background: var(--wk-surface); width: fit-content; }
.be-toolbar button { width: 32px; height: 32px; border: none; background: none; border-radius: 7px; cursor: pointer; color: var(--wk-text-2); font-size: 13px; }
.be-toolbar button:hover { background: var(--wk-brand-soft); color: var(--wk-brand); }

.be-doc { display: flex; flex-direction: column; }
.be-block { position: relative; padding-left: 52px; margin: 1px 0; border-radius: 6px; }
.be-block.dragging { opacity: 0.4; }
.be-block.drop-before::before, .be-block.drop-after::after { content: ''; position: absolute; left: 52px; right: 0; height: 2px; background: var(--wk-brand); border-radius: 2px; }
.be-block.drop-before::before { top: -1px; }
.be-block.drop-after::after { bottom: -1px; }

.be-gutter { position: absolute; left: 8px; top: 3px; display: flex; gap: 1px; opacity: 0; transition: opacity 0.12s; }
.be-block:hover .be-gutter { opacity: 1; }
.be-g-btn { width: 20px; height: 24px; border: none; background: none; border-radius: 5px; cursor: pointer; color: var(--wk-muted); font-size: 11px; }
.be-g-btn:hover { background: var(--wk-brand-soft); color: var(--wk-brand); }
.be-handle { cursor: grab; }

.be-edit { outline: none; min-height: 1.6em; }
.be-edit:empty::before { content: attr(data-ph); color: var(--wk-muted); pointer-events: none; }
.be-paragraph { font-size: 15.5px; line-height: 1.75; color: var(--wk-text-2); padding: 3px 0; }
.be-h2 { font-size: 22px; font-weight: 700; color: var(--wk-text); margin: 12px 0 2px; }
.be-h3 { font-size: 17px; font-weight: 700; color: var(--wk-text); margin: 8px 0 2px; }
.be-quote { font-size: 15.5px; line-height: 1.7; color: var(--wk-text-2); padding: 4px 0 4px 16px; border-left: 3px solid var(--wk-border); font-style: italic; }

.be-li { display: flex; gap: 10px; padding: 2px 0; }
.be-marker { flex-shrink: 0; min-width: 18px; text-align: right; color: var(--wk-text-2); font-size: 15px; line-height: 1.75; user-select: none; }
.be-li .be-edit { flex: 1; font-size: 15.5px; line-height: 1.75; color: var(--wk-text-2); }

.be-callout { display: flex; gap: 12px; padding: 14px 16px; border-radius: 14px; margin: 8px 0; border: 1px solid; color: var(--wk-text); }
.be-callout > i { margin-top: 3px; }
.be-callout .be-edit { flex: 1; font-size: 14.5px; line-height: 1.6; }
.be-callout.info { background: color-mix(in srgb, var(--wk-brand) 8%, transparent); border-color: color-mix(in srgb, var(--wk-brand) 30%, transparent); }
.be-callout.info > i { color: var(--wk-brand); }
.be-callout.warn { background: color-mix(in srgb, #f59e0b 12%, transparent); border-color: color-mix(in srgb, #f59e0b 35%, transparent); }
.be-callout.warn > i { color: #f59e0b; }

.be-hr { border: none; border-top: 1px solid var(--wk-border); margin: 14px 0; }
.be-img img { max-width: 100%; border-radius: 12px; margin: 8px 0; }
.be-video video { max-width: 100%; border-radius: 12px; margin: 8px 0; display: block; background: #000; }

.be-edit :deep(a) { color: var(--wk-brand); }
.be-edit :deep(strong) { color: var(--wk-text); }

.be-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
.be-btn { height: 42px; padding: 0 20px; border-radius: 11px; font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid var(--wk-border); }
.be-btn.ghost { background: transparent; color: var(--wk-text-2); }
.be-btn.ghost:hover { color: var(--wk-text); }
.be-btn.primary { background: var(--wk-brand); border-color: var(--wk-brand); color: #fff; }

/* Меню добавления (телепорт) */
.be-menu { position: fixed; z-index: 340; width: 230px; max-height: 320px; overflow-y: auto; padding: 6px; border-radius: 14px; background: #fff; border: 1px solid #eaedf2; box-shadow: 0 12px 34px rgba(15,23,42,0.16); }
.be-menu button { display: flex; align-items: center; gap: 11px; width: 100%; padding: 9px 11px; border: none; background: none; border-radius: 9px; cursor: pointer; font-size: 13px; color: #475569; text-align: left; }
.be-menu button i { width: 16px; text-align: center; color: #94a3b8; }
.be-menu button:hover { background: #eff6ff; color: #3b82f6; }
.be-menu button:hover i { color: #3b82f6; }
.be-menu.dark { background: #161b22; border-color: #2a313b; box-shadow: 0 12px 34px rgba(0,0,0,0.55); }
.be-menu.dark button { color: #b2bac6; }
.be-menu.dark button i { color: #7d8590; }
.be-menu.dark button:hover { background: #1c2740; color: #60a5fa; }
.be-menu.dark button:hover i { color: #60a5fa; }
.be-menu button.danger:hover { background: rgba(239,68,68,0.12); color: #ef4444; }
.be-menu button.danger:hover i { color: #ef4444; }
</style>
