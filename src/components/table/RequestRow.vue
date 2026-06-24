<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '../../stores/chat'

const props = defineProps({
  row: {
    type: Object,
    required: true,
  },
  expanded: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['toggle', 'open-request', 'download-attachment', 'attach-invoice', 'compare-invoices', 'toggle-check', 'chat-open'])
const router = useRouter()
const chat = useChatStore()
const attachmentsOpen = ref(false)
const attachmentsWrapRef = ref(null)
const attachmentsBtnRef = ref(null)
const attachmentsMenuRef = ref(null)
const attachmentsMenuStyle = ref({})
const actionOpen = ref(false)
const actionWrapRef = ref(null)
const actionBtnRef = ref(null)
const actionMenuRef = ref(null)
const actionMenuStyle = ref({})
const docTooltipOpenId = ref('')
const docTooltipStyle = ref({})
const docTooltipRef = ref(null)
const docIconRefs = new Map()
let docTooltipCloseTimer = null

const positionAttachmentsMenu = () => {
  const rect = attachmentsBtnRef.value?.getBoundingClientRect()
  if (!rect) return
  const gap = 6
  const maxWidth = 320
  const viewportWidth = window.innerWidth || 0
  const viewportHeight = window.innerHeight || 0
  const menuHeight = attachmentsMenuRef.value?.offsetHeight || 200

  const left = Math.max(8, Math.min(rect.left, viewportWidth - maxWidth - 8))
  const fitsBelow = rect.bottom + gap + menuHeight <= viewportHeight - 8
  const fitsAbove = rect.top - gap - menuHeight >= 8

  let top = rect.bottom + gap
  if (!fitsBelow && fitsAbove) {
    top = rect.top - menuHeight - gap
  } else if (!fitsBelow) {
    top = Math.max(8, viewportHeight - menuHeight - 8)
  }

  attachmentsMenuStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
  }
}

const toggleAttachments = () => {
  attachmentsOpen.value = !attachmentsOpen.value
  if (attachmentsOpen.value) {
    requestAnimationFrame(() => {
      positionAttachmentsMenu()
    })
  }
}

const positionActionMenu = () => {
  const rect = actionBtnRef.value?.getBoundingClientRect()
  if (!rect) return
  const gap = 6
  const menuWidth = 210
  const menuHeight = actionMenuRef.value?.offsetHeight || 80
  const viewportWidth = window.innerWidth || 0
  const viewportHeight = window.innerHeight || 0

  const left = Math.max(8, Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 8))
  const fitsBelow = rect.bottom + gap + menuHeight <= viewportHeight - 8
  const fitsAbove = rect.top - gap - menuHeight >= 8

  let top = rect.bottom + gap
  if (!fitsBelow && fitsAbove) {
    top = rect.top - menuHeight - gap
  } else if (!fitsBelow) {
    top = Math.max(8, viewportHeight - menuHeight - 8)
  }

  actionMenuStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
  }
}

const toggleActionMenu = () => {
  actionOpen.value = !actionOpen.value
  if (actionOpen.value) {
    requestAnimationFrame(() => {
      positionActionMenu()
    })
  }
}

const closeAttachmentsOutside = (event) => {
  const target = event.target
  if (!(target instanceof Node)) return

  const attachmentsEl = attachmentsWrapRef.value
  if (!attachmentsEl || !attachmentsEl.contains(target)) attachmentsOpen.value = false

  const actionEl = actionWrapRef.value
  if (!actionEl || !actionEl.contains(target)) actionOpen.value = false

  const insideDoc = target?.closest?.('.doc-item') || target?.closest?.('.doc-tooltip')
  if (!insideDoc) docTooltipOpenId.value = ''
}

const download = (file) => {
  attachmentsOpen.value = false
  emit('download-attachment', { requestId: props.row.id, file })
}

const attachInvoice = () => {
  actionOpen.value = false
  emit('attach-invoice', props.row.id)
}

const openInvoiceCompare = () => {
  actionOpen.value = false
  emit('compare-invoices', props.row.id)
}

const setDocIconRef = (id, el) => {
  const key = String(id || '')
  if (!key) return
  if (el) docIconRefs.set(key, el)
  else docIconRefs.delete(key)
}

const positionDocTooltip = (docId) => {
  const key = String(docId || '')
  if (!key) return
  const anchor = docIconRefs.get(key)
  if (!anchor) return
  const rect = anchor.getBoundingClientRect()
  const gap = 8
  const viewportWidth = window.innerWidth || 0
  const viewportHeight = window.innerHeight || 0
  const tooltipWidth = Math.min(360, Math.max(260, docTooltipRef.value?.offsetWidth || 300))
  const tooltipHeight = docTooltipRef.value?.offsetHeight || 180

  let left = rect.right + gap
  if (left + tooltipWidth > viewportWidth - 8) {
    left = rect.left - tooltipWidth - gap
  }
  if (left < 8) left = Math.max(8, viewportWidth - tooltipWidth - 8)

  let top = rect.top
  if (top + tooltipHeight > viewportHeight - 8) {
    top = viewportHeight - tooltipHeight - 8
  }
  if (top < 8) top = 8

  docTooltipStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
  }
}

const clearDocTooltipCloseTimer = () => {
  if (!docTooltipCloseTimer) return
  clearTimeout(docTooltipCloseTimer)
  docTooltipCloseTimer = null
}

const scheduleDocTooltipClose = () => {
  clearDocTooltipCloseTimer()
  docTooltipCloseTimer = setTimeout(() => {
    docTooltipOpenId.value = ''
  }, 120)
}

const keepDocTooltipOpen = () => {
  clearDocTooltipCloseTimer()
}

const openDocTooltip = (doc) => {
  const id = String(doc?.id || '')
  if (!id) return
  clearDocTooltipCloseTimer()
  docTooltipOpenId.value = id
  requestAnimationFrame(() => {
    positionDocTooltip(id)
  })
}

const openInvoice = (doc, mode = 'view') => {
  const invoiceId = doc?.id
  if (!invoiceId) return
  docTooltipOpenId.value = ''
  router.push({
    path: `/invoices/${encodeURIComponent(String(invoiceId))}/process`,
    query: {
      request_id: String(props.row.id || ''),
      mode,
      back: '/',
    },
  })
}

const handleDocTooltipResize = () => {
  if (!docTooltipOpenId.value) return
  positionDocTooltip(docTooltipOpenId.value)
}

onMounted(() => {
  window.addEventListener('mousedown', closeAttachmentsOutside)
  window.addEventListener('resize', positionAttachmentsMenu)
  window.addEventListener('resize', positionActionMenu)
  window.addEventListener('resize', handleDocTooltipResize)
  window.addEventListener('scroll', handleDocTooltipResize, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', closeAttachmentsOutside)
  window.removeEventListener('resize', positionAttachmentsMenu)
  window.removeEventListener('resize', positionActionMenu)
  window.removeEventListener('resize', handleDocTooltipResize)
  window.removeEventListener('scroll', handleDocTooltipResize, true)
  clearDocTooltipCloseTimer()
})

const getBadge = (chatId) => {
  if (!chatId) return null
  const b = chat.badges[chatId]
  return b && b.mention ? 'mention' : b?.unread ? 'unread' : null
}
</script>

<template>
  <tr :class="row.statusClass">
    <td class="check-cell">
      <div class="left-marker">
        <template v-if="row.leftIndicator?.type === 'segments'">
          <div
            v-for="(segment, idx) in row.leftIndicator.segments || []"
            :key="`left-seg-${row.id}-${idx}`"
            class="left-marker-segment"
            :class="`seg-${segment.status || 'pending'}`"
          ></div>
        </template>
        <template v-else>
          <div class="left-marker-solid" :class="`solid-${row.statusClass}`"></div>
        </template>
      </div>
      <input :checked="Boolean(row.checked)" type="checkbox" @change="emit('toggle-check', { id: row.id, checked: $event.target.checked })">
    </td>
    <td>
      <a
        href="#"
        class="id-badge id-link"
        @click.prevent="emit('open-request', row.id)"
      >
        #{{ row.id }}
      </a>
    </td>
    <td>
      <div class="request-title">{{ row.title }}</div>
      <div v-if="row.cloneTag" class="clone-tag">{{ row.cloneTag }}</div>
      <div v-if="row.positions" class="positions-toggle">
        <a
          class="toggle-positions"
          href="#"
          @click.prevent="emit('toggle', row.id)"
        >
          <i
            class="fas"
            :class="expanded ? 'fa-chevron-up' : 'fa-chevron-down'"
            style="font-size: 10px;"
          ></i>
          {{ row.positions }}
        </a>
      </div>
      <div v-if="row.attachments?.length" class="attachments-wrap" ref="attachmentsWrapRef">
        <button ref="attachmentsBtnRef" class="attachments-btn" type="button" @click.stop="toggleAttachments">
          <i class="fas fa-paperclip"></i>
          Приложения
          <i class="fas" :class="attachmentsOpen ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
        </button>
        <div v-if="attachmentsOpen" ref="attachmentsMenuRef" class="attachments-menu" :style="attachmentsMenuStyle">
          <button
            v-for="file in row.attachments"
            :key="file.id"
            class="attachments-item"
            type="button"
            @click="download(file)"
          >
            <i class="fas fa-file-arrow-down"></i>
            <span>{{ file.name }}</span>
          </button>
        </div>
      </div>
      <button
        class="req-chat-btn"
        type="button"
        title="Чат заявки"
        @click.stop="emit('chat-open', { chatId: row.chat_id, requestId: row.id, title: row.title })"
      >
        <span class="req-chat-icon-wrap">
          <i class="fas fa-comment-dots"></i>
          <span v-if="row.chat_id && getBadge(row.chat_id)" class="req-chat-badge badge-red"></span>
        </span>
      </button>
    </td>
    <td>
      <span v-for="(chip, idx) in row.projects" :key="`chip-${idx}`" class="chip">
        {{ chip }}
      </span>
    </td>
    <td>
      <div v-for="(user, idx) in row.users" :key="`user-${idx}`" class="user-row">
        <i :class="['user-icon', user.icon]"></i> {{ user.name }}
      </div>
    </td>
    <td>
      <div
        v-for="(acceptor, idx) in row.acceptors"
        :key="`acceptor-${idx}`"
        class="status-pill"
        :class="acceptor.variant"
      >
        <span class="st-dot"></span> {{ acceptor.name }}
        <template v-if="acceptor.date">
          <span> - </span>
          <span class="acceptor-date-in-pill">{{ acceptor.date }}</span>
        </template>
      </div>
    </td>
    <td>
      <div class="date-group">
        <div v-for="(item, idx) in row.dates" :key="`date-${idx}`" class="date-item">
          <span class="date-label">{{ item.label }}</span>
          <span class="date-val" :style="item.color ? { color: item.color } : null">
            {{ item.value }}
          </span>
        </div>
        <div v-if="row.overdue" class="overdue-badge">
          <i class="fas fa-clock"></i> {{ row.overdue }}
        </div>
        <div v-if="row.completed" class="completed-badge">
          {{ row.completed }}
        </div>
      </div>
    </td>
    <td v-for="(bar, idx) in row.statusBars" :key="`bar-${idx}`" class="chart-cell">
      <div class="bar-value">{{ bar.label || '' }}</div>
      <div class="bar-track">
        <template v-if="bar.type === 'segments'">
          <div class="segment-track">
            <div
              v-for="(segment, sIdx) in bar.segments"
              :key="`segment-${idx}-${sIdx}`"
              class="segment-fill"
              :class="`seg-${segment.status || 'pending'}`"
            ></div>
          </div>
        </template>
        <template v-else>
          <div class="bar-fill" :class="bar.variant" :style="{ height: bar.height }"></div>
        </template>
      </div>
      <div v-if="bar.title" class="bar-tooltip-block">
        {{ bar.title }}
      </div>
    </td>
    <td>
      <div class="doc-stack">
        <div
          v-for="(doc, idx) in row.docs"
          :key="`doc-${idx}`"
          class="doc-item"
          @mouseenter="openDocTooltip(doc)"
          @mouseleave="scheduleDocTooltipClose"
        >
          <i :ref="(el) => setDocIconRef(doc.id, el)" :class="['doc-icon', doc.icon]">
            <div v-if="doc.status" class="doc-status" :class="doc.status"></div>
          </i>
          <div
            v-if="docTooltipOpenId === String(doc.id)"
            ref="docTooltipRef"
            class="doc-tooltip"
            :style="docTooltipStyle"
            @mouseenter="keepDocTooltipOpen"
            @mouseleave="scheduleDocTooltipClose"
            @mousedown.stop
          >
            <div class="doc-tooltip-title">{{ doc.title }}</div>
            <div class="doc-tooltip-row"><span>Плательщик:</span> {{ doc.payerName }}</div>
            <div class="doc-tooltip-row"><span>Поставщик:</span> {{ doc.providerName }}</div>
            <div class="doc-tooltip-row"><span>Статус:</span> {{ doc.statusName }}</div>
            <div class="doc-tooltip-actions">
              <button type="button" class="doc-tooltip-btn" @click.stop="openInvoice(doc, 'view')">Посмотреть</button>
              <button type="button" class="doc-tooltip-btn" @click.stop="openInvoice(doc, 'edit')">Изменить</button>
            </div>
          </div>
        </div>
      </div>
    </td>
    <td>
      <div ref="actionWrapRef" class="action-wrap">
        <button ref="actionBtnRef" class="action-btn" type="button" @click.stop="toggleActionMenu">
          <i class="fas fa-ellipsis-vertical"></i>
        </button>
        <div v-if="actionOpen" ref="actionMenuRef" class="action-menu" :style="actionMenuStyle">
          <button class="action-item" type="button" @click="attachInvoice">
            Прикрепить счет
          </button>
          <button class="action-item" type="button" @click="openInvoiceCompare">
            Сравнение счетов
          </button>
        </div>
      </div>
    </td>
  </tr>
</template>

<style scoped>
tr:hover td {
  background-color: var(--bg-subtle);
}

td,
th {
  border-left: 1px solid var(--border-light);
  border-right: 1px solid var(--border-light);
}

td {
  padding: 8px 8px;
  vertical-align: top;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-light);
}

td:first-child {
  border-left: none;
}

td:last-child {
  border-right: none;
}

.check-cell {
  position: relative;
  text-align: center;
}

.left-marker {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.left-marker-segment {
  flex: 1;
  width: 100%;
}

.left-marker-solid {
  width: 100%;
  height: 100%;
}

.solid-row-new {
  background: #94a3b8;
}

.solid-row-work {
  background: var(--brand-primary);
}

.solid-row-wait {
  background: #f59e0b;
}

.solid-row-done {
  background: #10b981;
}

.id-badge {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  color: var(--text-secondary);
  font-weight: 500;
}

.id-link {
  text-decoration: underline;
  cursor: pointer;
}

.id-link:hover {
  color: var(--brand-primary);
}

.request-title {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 4px;
  color: var(--text-primary);
  line-height: 1.3;
}

.positions-toggle {
  margin-top: 3px;
}

.clone-tag {
  font-size: 10px;
  color: var(--text-secondary);
  margin-top: 1px;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--bg-subtle);
  display: inline-block;
}

.attachments-wrap {
  margin-top: 3px;
}

.req-chat-btn {
  background: transparent;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  cursor: pointer;
  padding: 2px 6px;
  margin-top: 2px;
  display: inline-flex;
  align-items: center;
  transition: all 0.2s;
}

.toggle-positions {
  color: var(--brand-primary);
  font-size: 11px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 2px 6px;
  margin-left: -6px;
  border-radius: 4px;
}

.toggle-positions:hover {
  background: var(--brand-light);
}

.attachments-wrap {
  margin-top: 6px;
  position: relative;
  width: fit-content;
}

.attachments-btn {
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 11px;
  border-radius: 6px;
  padding: 4px 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.attachments-btn:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.attachments-menu {
  position: fixed;
  z-index: 220;
  min-width: 220px;
  max-width: 300px;
  max-height: min(320px, calc(100vh - 16px));
  overflow: auto;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  padding: 4px;
}

.attachments-item {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  padding: 7px 8px;
  border-radius: 6px;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
}

.attachments-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachments-item:hover {
  background: var(--bg-subtle);
}

.clone-tag {
  font-size: 10px;
  background: var(--bg-subtle);
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-block;
  color: var(--text-secondary);
}

.user-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
  font-size: 11px;
}

.date-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.chip {
  display: inline-block;
  background: var(--bg-subtle);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 10px;
  margin: 1px 2px 1px 0;
}

.chart-cell {
  padding: 4px 6px;
  vertical-align: top;
  height: 52px;
  position: relative;
  overflow: visible;
  white-space: nowrap;
}

.user-icon {
  width: 14px;
  text-align: center;
  color: var(--text-tertiary);
}

.date-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.date-item {
  display: flex;
  flex-direction: column;
}

.date-label {
  font-size: 10px;
  color: var(--text-tertiary);
  text-transform: uppercase;
}

.date-val {
  font-size: 11px;
  font-weight: 500;
  font-family: "JetBrains Mono", monospace;
}

.overdue-badge {
  margin-top: 4px;
  font-size: 10px;
  color: var(--danger-text);
  background: var(--danger-bg);
  padding: 2px 6px;
  border-radius: 4px;
  width: fit-content;
  font-weight: 600;
}

.completed-badge {
  font-size: 10px;
  color: var(--success-text);
  background: var(--success-bg);
  padding: 2px 6px;
  border-radius: 4px;
  width: fit-content;
}

.chart-cell-dup {
  display: none;
}

.bar-track {
  width: 6px;
  height: 36px;
  background: var(--border-light);
  border-radius: 3px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column-reverse;
  margin: 0 auto;
}

.bar-value {
  text-align: center;
  font-size: 9px;
  font-weight: 700;
  color: var(--brand-primary);
  line-height: 1;
  white-space: nowrap;
  height: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 3px;
}

.overdue-badge {
  margin-top: 2px;
  font-size: 10px;
  color: var(--danger-text);
  background: var(--danger-bg);
  padding: 1px 4px;
  border-radius: 4px;
  width: fit-content;
  font-weight: 600;
}

.completed-badge {
  margin-top: 2px;
  font-size: 10px;
  color: var(--success-text);
  background: var(--success-bg);
  padding: 1px 4px;
  border-radius: 4px;
  width: fit-content;
}

/* second bar-track removed — see above */

.bar-fill {
  width: 100%;
  background: var(--brand-primary);
  transition: height 0.3s ease;
  border-radius: 0;
}

.segment-track {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.segment-fill {
  flex: 1;
  width: 100%;
}

.seg-approved {
  background: #10b981;
}

.seg-rejected {
  background: #ef4444;
}

.seg-pending {
  background: #cbd5e1;
}

.fill-success {
  background: #10b981;
}

.fill-answer {
  background: #f59e0b;
}

.fill-stock {
  background: #3b82f6;
}

.fill-warn {
  background: #f59e0b;
}

.fill-muted {
  background: #cbd5e1;
}

.doc-stack {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.doc-item {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.doc-icon {
  color: var(--text-secondary);
  font-size: 20px;
  position: relative;
  cursor: pointer;
  transition: color 0.2s;
}

.doc-icon:hover {
  color: var(--brand-primary);
}

.doc-tooltip {
  position: fixed;
  z-index: 260;
  min-width: 260px;
  max-width: 360px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  padding: 10px;
  pointer-events: auto;
}

.doc-tooltip-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
  line-height: 1.35;
}

.doc-tooltip-row {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 6px;
  line-height: 1.35;
}

.doc-tooltip-row span {
  color: var(--text-tertiary);
}

.doc-tooltip-actions {
  margin-top: 8px;
  display: flex;
  gap: 6px;
}

.doc-tooltip-btn {
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 11px;
  border-radius: 6px;
  padding: 5px 8px;
  cursor: pointer;
}

.doc-tooltip-btn:hover {
  background: var(--bg-subtle);
}

.doc-status {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px solid var(--bg-surface);
}

.ds-process {
  background: #f59e0b;
}

.ds-ok {
  background: #10b981;
}

.ds-blue {
  background: #3b82f6;
}

.action-wrap {
  display: flex;
  gap: 4px;
  position: relative;
}

.action-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  transition: all 0.2s;
  cursor: pointer;
}

.action-btn:hover {
  background: var(--bg-body);
  color: var(--text-primary);
}

.action-menu {
  position: fixed;
  z-index: 220;
  min-width: 210px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  padding: 4px;
}

.action-item {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
}

.action-item:hover {
  background: var(--bg-subtle);
}

.bar-tooltip-block {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translateX(-50%);
  min-width: 180px;
  max-width: 260px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  font-size: 11px;
  color: var(--text-primary);
  line-height: 1.35;
  text-align: center;
  z-index: 40;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.15s ease, visibility 0.15s ease;
}

.chart-cell:hover .bar-tooltip-block {
  opacity: 1;
  visibility: visible;
}

.req-chat-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 2px;
  margin-top: 4px;
  color: var(--text-secondary, #64748b);
}

.req-chat-btn:hover {
  color: var(--brand-primary, #3b82f6);
}

.req-chat-icon-wrap {
  position: relative;
  display: inline-flex;
}

.req-chat-badge {
  position: absolute;
  top: -2px;
  right: -4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.req-chat-badge.badge-red {
  background: #ef4444;
}
</style>
