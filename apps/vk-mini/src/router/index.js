import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import WarehouseHomeView from '../views/WarehouseHomeView.vue'
import WarehousesMobileView from '../views/WarehousesMobileView.vue'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/warehouses' },
    { path: '/login', name: 'vk-login', component: LoginView, meta: { public: true } },
    { path: '/warehouses', name: 'vk-warehouses', component: WarehousesMobileView },
    { path: '/warehouses/:warehouseId', name: 'vk-warehouse-home', component: WarehouseHomeView },
  ],
})

router.beforeEach(async (to) => {
  if (to.meta.public) return true
  const auth = useAuthStore()
  await auth.init()
  if (!auth.isAuthenticated) {
    return { name: 'vk-login', query: { redirect: to.fullPath } }
  }
  return true
})

export default router
