// Цвета приоритетов 0–7, 8+ — серый
const PRIORITY_COLORS = {
  0: { bg: '#7c3aed', text: '#fff' }, // фиолетовый — самый срочный
  1: { bg: '#dc2626', text: '#fff' }, // красный
  2: { bg: '#ea580c', text: '#fff' }, // оранжево-красный
  3: { bg: '#d97706', text: '#fff' }, // янтарный
  4: { bg: '#ca8a04', text: '#fff' }, // жёлто-коричневый
  5: { bg: '#16a34a', text: '#fff' }, // зелёный
  6: { bg: '#0284c7', text: '#fff' }, // голубой
  7: { bg: '#4f46e5', text: '#fff' }, // индиго
}
const DEFAULT_PRIORITY_COLOR = { bg: '#94a3b8', text: '#fff' } // серый 8+

export const priorityBg = (p) =>
  (PRIORITY_COLORS[Number(p)] ?? DEFAULT_PRIORITY_COLOR).bg

export const priorityText = (p) =>
  (PRIORITY_COLORS[Number(p)] ?? DEFAULT_PRIORITY_COLOR).text

export const priorityStyle = (p) => ({
  backgroundColor: priorityBg(p),
  color: priorityText(p),
})
