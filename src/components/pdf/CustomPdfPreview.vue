<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import 'pdfjs-dist/web/pdf_viewer.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

const props = defineProps({
  src: {
    type: String,
    default: '',
  },
  viewportMaxHeight: {
    type: String,
    default: '',
  },
})

const viewportRef = ref(null)
const pagesRef = ref(null)
const loading = ref(false)
const error = ref('')
const scale = ref(1)
const fitScale = ref(1)
const pageCount = ref(0)
const rotation = ref(0)

let pdfDoc = null
let renderToken = 0
let renderTask = null
let resizeObserver = null
let isPanning = false
let panStartX = 0
let panStartY = 0
let panScrollLeft = 0
let panScrollTop = 0
let pendingZoomAnchor = null
let spacePressed = false

const zoomLabel = computed(() => `${Math.round(scale.value * 100)}%`)
const viewportStyle = computed(() => {
  if (!props.viewportMaxHeight) return {}
  return { maxHeight: props.viewportMaxHeight }
})

const clearPages = () => {
  if (pagesRef.value) pagesRef.value.innerHTML = ''
}

const stopRenderTask = async () => {
  if (renderTask?.cancel) {
    try {
      renderTask.cancel()
      await renderTask.promise.catch(() => {})
    } catch {
      // noop
    }
  }
  renderTask = null
}

const closeDocument = async () => {
  await stopRenderTask()
  if (pdfDoc) {
    try {
      await pdfDoc.destroy()
    } catch {
      // noop
    }
  }
  pdfDoc = null
  pageCount.value = 0
  clearPages()
}

const computeFitScale = async () => {
  if (!pdfDoc || !viewportRef.value) return 1
  const firstPage = await pdfDoc.getPage(1)
  const baseViewport = firstPage.getViewport({ scale: 1, rotation: rotation.value })
  const availableWidth = Math.max(120, viewportRef.value.clientWidth - 24)
  const nextFit = availableWidth / baseViewport.width
  return Number.isFinite(nextFit) && nextFit > 0 ? nextFit : 1
}

const computeFitHeightScale = async () => {
  if (!pdfDoc || !viewportRef.value) return 1
  const firstPage = await pdfDoc.getPage(1)
  const baseViewport = firstPage.getViewport({ scale: 1, rotation: rotation.value })
  const availableHeight = Math.max(120, viewportRef.value.clientHeight - 24)
  const nextFit = availableHeight / baseViewport.height
  return Number.isFinite(nextFit) && nextFit > 0 ? nextFit : 1
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const applyZoomAnchor = () => {
  if (!viewportRef.value || !pendingZoomAnchor) return
  const vp = viewportRef.value
  const ratio = scale.value / pendingZoomAnchor.oldScale
  const nextLeft = pendingZoomAnchor.contentX * ratio - pendingZoomAnchor.viewportX
  const nextTop = pendingZoomAnchor.contentY * ratio - pendingZoomAnchor.viewportY
  vp.scrollLeft = clamp(nextLeft, 0, Math.max(0, vp.scrollWidth - vp.clientWidth))
  vp.scrollTop = clamp(nextTop, 0, Math.max(0, vp.scrollHeight - vp.clientHeight))
  pendingZoomAnchor = null
}

const setScaleWithAnchor = (nextScale, clientX = null, clientY = null) => {
  if (!viewportRef.value) {
    scale.value = nextScale
    return
  }
  const vp = viewportRef.value
  const rect = vp.getBoundingClientRect()
  const viewportX = clientX == null ? vp.clientWidth / 2 : (clientX - rect.left)
  const viewportY = clientY == null ? vp.clientHeight / 2 : (clientY - rect.top)
  pendingZoomAnchor = {
    oldScale: scale.value,
    viewportX,
    viewportY,
    contentX: vp.scrollLeft + viewportX,
    contentY: vp.scrollTop + viewportY,
  }
  scale.value = nextScale
}

const renderAllPages = async () => {
  if (!pdfDoc) return
  if (!pagesRef.value) await nextTick()
  if (!pagesRef.value) return

  const token = ++renderToken
  loading.value = true
  error.value = ''
  clearPages()

  try {
    for (let i = 1; i <= pdfDoc.numPages; i += 1) {
      if (token !== renderToken) return
      // eslint-disable-next-line no-await-in-loop
      const page = await pdfDoc.getPage(i)
      if (token !== renderToken) return

      const viewport = page.getViewport({ scale: scale.value, rotation: rotation.value })
      const outputScale = window.devicePixelRatio || 1

      const pageWrap = document.createElement('div')
      pageWrap.className = 'pdf-page-wrap'

      const pageNum = document.createElement('div')
      pageNum.className = 'pdf-page-num'
      pageNum.textContent = `Страница ${i}`

      const pageBody = document.createElement('div')
      pageBody.className = 'pdf-page-body'

      const canvas = document.createElement('canvas')
      canvas.className = 'pdf-canvas'
      canvas.width = Math.floor(viewport.width * outputScale)
      canvas.height = Math.floor(viewport.height * outputScale)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`

      const context = canvas.getContext('2d', { alpha: false })
      if (!context) continue
      context.setTransform(outputScale, 0, 0, outputScale, 0, 0)

      const textLayerDiv = document.createElement('div')
      textLayerDiv.className = 'textLayer'
      textLayerDiv.style.width = `${Math.floor(viewport.width)}px`
      textLayerDiv.style.height = `${Math.floor(viewport.height)}px`
      textLayerDiv.style.setProperty('--scale-factor', `${scale.value}`)

      pageWrap.appendChild(pageNum)
      pageBody.appendChild(canvas)
      pageBody.appendChild(textLayerDiv)
      pageWrap.appendChild(pageBody)
      pagesRef.value.appendChild(pageWrap)

      const task = page.render({ canvasContext: context, viewport })
      renderTask = task
      // eslint-disable-next-line no-await-in-loop
      await task.promise
      renderTask = null

      // Render selectable text layer (copy/search friendly).
      // eslint-disable-next-line no-await-in-loop
      const textContent = await page.getTextContent()
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport,
      })
      // eslint-disable-next-line no-await-in-loop
      await textLayer.render()
    }
  } catch (err) {
    if (token === renderToken) {
      error.value = 'Не удалось отрисовать PDF.'
    }
  } finally {
    if (token === renderToken) {
      loading.value = false
      applyZoomAnchor()
    }
  }
}

const loadPdf = async () => {
  await closeDocument()
  error.value = ''
  if (!props.src) return

  loading.value = true
  try {
    const task = pdfjsLib.getDocument({ url: props.src })
    const doc = await task.promise
    pdfDoc = doc
    pageCount.value = doc.numPages

    fitScale.value = await computeFitScale()
    scale.value = fitScale.value

    await nextTick()
    await renderAllPages()
  } catch {
    error.value = 'Не удалось загрузить PDF.'
    loading.value = false
  }
}

const zoomIn = () => {
  const next = Math.min(4, Number((scale.value + 0.1).toFixed(2)))
  setScaleWithAnchor(next)
}

const zoomOut = () => {
  const next = Math.max(0.3, Number((scale.value - 0.1).toFixed(2)))
  setScaleWithAnchor(next)
}

const zoomReset = () => {
  setScaleWithAnchor(1)
}

const zoomFit = async () => {
  fitScale.value = await computeFitScale()
  setScaleWithAnchor(fitScale.value)
}

const zoomFitHeight = async () => {
  const next = await computeFitHeightScale()
  setScaleWithAnchor(next)
}

const rotateLeft = async () => {
  rotation.value = (rotation.value + 270) % 360
  fitScale.value = await computeFitScale()
  await renderAllPages()
}

const rotateRight = async () => {
  rotation.value = (rotation.value + 90) % 360
  fitScale.value = await computeFitScale()
  await renderAllPages()
}

const onPointerDown = (event) => {
  if (!viewportRef.value) return
  const canPanWithLeft = event.button === 0 && spacePressed
  const canPanWithMiddle = event.button === 1
  if (!canPanWithLeft && !canPanWithMiddle) return
  event.preventDefault()
  isPanning = true
  panStartX = event.clientX
  panStartY = event.clientY
  panScrollLeft = viewportRef.value.scrollLeft
  panScrollTop = viewportRef.value.scrollTop
  viewportRef.value.classList.add('is-panning')
}

const onPointerMove = (event) => {
  if (!isPanning || !viewportRef.value) return
  const dx = event.clientX - panStartX
  const dy = event.clientY - panStartY
  viewportRef.value.scrollLeft = panScrollLeft - dx
  viewportRef.value.scrollTop = panScrollTop - dy
}

const stopPanning = () => {
  isPanning = false
  viewportRef.value?.classList.remove('is-panning')
}

const onWheel = (event) => {
  if (!event.ctrlKey) return
  event.preventDefault()
  if (event.deltaY < 0) {
    const next = Math.min(4, Number((scale.value + 0.1).toFixed(2)))
    setScaleWithAnchor(next, event.clientX, event.clientY)
  } else {
    const next = Math.max(0.3, Number((scale.value - 0.1).toFixed(2)))
    setScaleWithAnchor(next, event.clientX, event.clientY)
  }
}

const onKeyDown = (event) => {
  if (event.code === 'Space') {
    spacePressed = true
    viewportRef.value?.classList.add('space-pan')
  }
}

const onKeyUp = (event) => {
  if (event.code === 'Space') {
    spacePressed = false
    viewportRef.value?.classList.remove('space-pan')
  }
}

watch(() => props.src, () => {
  loadPdf()
}, { immediate: true })

watch(scale, async () => {
  if (!pdfDoc) return
  await renderAllPages()
})

onMounted(() => {
  const onResize = async () => {
    if (!pdfDoc) return
    fitScale.value = await computeFitScale()
  }
  resizeObserver = new ResizeObserver(onResize)
  if (viewportRef.value) resizeObserver.observe(viewportRef.value)
  window.addEventListener('mouseup', stopPanning)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})

onBeforeUnmount(async () => {
  window.removeEventListener('mouseup', stopPanning)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  resizeObserver?.disconnect()
  resizeObserver = null
  await closeDocument()
})
</script>

<template>
  <div class="pdf-viewer">
    <div class="pdf-toolbar">
      <div class="toolbar-left">
        <button class="tool-btn" type="button" @click="zoomOut">-</button>
        <span class="zoom-label">{{ zoomLabel }}</span>
        <button class="tool-btn" type="button" @click="zoomIn">+</button>
        <button class="tool-btn" type="button" @click="zoomReset">100%</button>
        <button class="tool-btn" type="button" @click="zoomFit">По ширине</button>
        <button class="tool-btn" type="button" @click="zoomFitHeight">По высоте</button>
        <button class="tool-btn" type="button" @click="rotateLeft">⟲</button>
        <button class="tool-btn" type="button" @click="rotateRight">⟳</button>
      </div>
      <div class="toolbar-right">Страниц: {{ pageCount }}</div>
    </div>

    <div
      ref="viewportRef"
      class="pdf-viewport"
      :style="viewportStyle"
      @mousedown="onPointerDown"
      @mousemove="onPointerMove"
      @mouseleave="stopPanning"
      @wheel="onWheel"
    >
      <div ref="pagesRef" class="pdf-pages"></div>
      <div v-if="loading" class="pdf-state">Загрузка PDF...</div>
      <div v-if="error" class="pdf-state error">{{ error }}</div>
    </div>
  </div>
</template>

<style scoped>
.pdf-viewer {
  height: 100%;
  min-height: 260px;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.pdf-toolbar {
  min-height: 40px;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  background: var(--bg-subtle);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.toolbar-right {
  font-size: 12px;
  color: var(--text-secondary);
}

.tool-btn {
  height: 28px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  padding: 0 10px;
  font-size: 12px;
  cursor: pointer;
}

.tool-btn:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.zoom-label {
  min-width: 56px;
  text-align: center;
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 600;
}

.pdf-viewport {
  flex: 1;
  overflow: auto;
  cursor: text;
  background: #e2e8f0;
  position: relative;
  touch-action: none;
}

.pdf-viewport.space-pan {
  cursor: grab;
}

.pdf-viewport.is-panning {
  cursor: grabbing;
}

.pdf-pages {
  min-height: 100%;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  width: max-content;
  min-width: 100%;
}

:deep(.pdf-page-wrap) {
  width: fit-content;
  background: #fff;
  border: 1px solid #cbd5e1;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.08);
}

:deep(.pdf-page-body) {
  position: relative;
}

:deep(.pdf-page-num) {
  height: 24px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  font-size: 11px;
  color: var(--text-secondary);
  border-bottom: 1px solid #e2e8f0;
}

:deep(.pdf-canvas) {
  display: block;
  user-select: none;
}

:deep(.textLayer) {
  position: absolute;
  inset: 0;
  overflow: hidden;
  line-height: 1;
  z-index: 2;
}

.pdf-state {
  position: absolute;
  inset: 0;
  height: 100%;
  min-height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-secondary);
}

.pdf-state.error {
  color: var(--danger-text);
}
</style>
