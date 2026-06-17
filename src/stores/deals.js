import { defineStore } from "pinia"

const STORAGE_KEY = "supply-deals-v1"

const normalizeNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

const uid = () => String(Date.now()) + "-" + Math.random().toString(16).slice(2, 8)

const createCreator = (user) => ({
  id: user?.id || "",
  shortName: user?.short_fio || [user?.surname, user?.name].filter(Boolean).join(" ") || "—",
})

const createBaseAdjustments = () => ({
  markup: 0,
  discount: 0,
})

const createDealDraft = (user, nextId) => {
  const now = new Date().toISOString()
  return {
    id: nextId,
    title: "Сделка " + nextId,
    status: "new",
    creator: createCreator(user),
    createdAt: now,
    updatedAt: now,
    startedAt: "",
    completedAt: "",
    rejectedAt: "",
    taxPercent: 20,
    items: [],
    services: [],
    deliveries: [],
    adjustments: {
      items: createBaseAdjustments(),
      services: createBaseAdjustments(),
      deliveries: createBaseAdjustments(),
    },
  }
}

const hydrateDeal = (deal) => ({
  ...deal,
  items: Array.isArray(deal?.items) ? deal.items : [],
  services: Array.isArray(deal?.services) ? deal.services : [],
  deliveries: Array.isArray(deal?.deliveries) ? deal.deliveries : [],
  adjustments: {
    items: { ...createBaseAdjustments(), ...(deal?.adjustments?.items || {}) },
    services: { ...createBaseAdjustments(), ...(deal?.adjustments?.services || {}) },
    deliveries: { ...createBaseAdjustments(), ...(deal?.adjustments?.deliveries || {}) },
  },
  taxPercent: normalizeNumber(deal?.taxPercent ?? 20),
})

export const useDealsStore = defineStore("deals", {
  state: () => ({
    initialized: false,
    deals: [],
    nextId: 1,
  }),
  getters: {
    sortedDeals(state) {
      return [...state.deals].sort((a, b) => Number(b.id) - Number(a.id))
    },
  },
  actions: {
    init() {
      if (this.initialized) return
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          this.deals = Array.isArray(parsed?.deals) ? parsed.deals.map(hydrateDeal) : []
          this.nextId = Number(parsed?.nextId) || (this.deals.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1)
        }
      } catch {
        this.deals = []
        this.nextId = 1
      }
      this.initialized = true
      this.persist()
    },
    persist() {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ deals: this.deals, nextId: this.nextId }))
    },
    createDeal(user) {
      const draft = createDealDraft(user, this.nextId)
      this.deals.unshift(draft)
      this.nextId += 1
      this.persist()
      return draft
    },
    saveDeal(payload) {
      const next = hydrateDeal({ ...payload, updatedAt: new Date().toISOString() })
      const index = this.deals.findIndex((deal) => String(deal.id) === String(next.id))
      if (index === -1) {
        this.deals.unshift(next)
      } else {
        this.deals.splice(index, 1, next)
      }
      this.persist()
      return next
    },
    updateStatus(id, status) {
      const index = this.deals.findIndex((deal) => String(deal.id) === String(id))
      if (index === -1) return null
      const current = { ...this.deals[index] }
      const now = new Date().toISOString()
      current.status = status
      current.updatedAt = now
      if (status === "in_progress" && !current.startedAt) current.startedAt = now
      if (status === "completed") current.completedAt = now
      if (status === "rejected") current.rejectedAt = now
      this.deals.splice(index, 1, hydrateDeal(current))
      this.persist()
      return this.deals[index]
    },
    getById(id) {
      return this.deals.find((deal) => String(deal.id) === String(id)) || null
    },
    createItem() {
      return {
        id: uid(),
        warehouseId: "",
        warehouseName: "",
        warehouseRowId: "",
        nomenclatureId: "",
        productName: "",
        unitName: "",
        available: 0,
        quantity: 0,
        price: 0,
      }
    },
    createService() {
      return {
        id: uid(),
        name: "",
        unitName: "",
        quantity: 0,
        price: 0,
      }
    },
    createDelivery() {
      return {
        id: uid(),
        type: "internal",
        cost: 0,
        comment: "",
      }
    },
  },
})
