import { defineStore } from 'pinia'

// Стор для реалтайма задач: счётчик незавершённых + шина WS-событий,
// на которую подписывается TasksView.
export const useTasksStore = defineStore('tasks', {
  state: () => ({
    incompleteCount: 0,
    lastEvent: null, // { type, payload, seq }
    _seq: 0,
  }),
  actions: {
    setIncompleteCount(n) {
      this.incompleteCount = Number(n) || 0
    },
    // Вызывается из chat store при получении WS-события по задачам/доскам/колонкам
    dispatchWs(type, payload) {
      if (type === 'incomplete_count') {
        this.setIncompleteCount(payload?.count ?? 0)
        return
      }
      this._seq += 1
      this.lastEvent = { type, payload, seq: this._seq }
    },
  },
})
