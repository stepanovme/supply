<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useVkStore } from '../stores/vk'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const vk = useVkStore()

const userName = computed(() => {
  const surname = String(auth.user?.surname || '').trim()
  const name = String(auth.user?.name || '').trim()
  return [name, surname].filter(Boolean).join(' ')
})

onMounted(async () => {
  await auth.init()
  if (auth.isAuthenticated) {
    router.replace(String(route.query.redirect || '/warehouses'))
  }
})

const handleLogin = () => {
  auth.login()
}
</script>

<template>
  <main class="vk-shell vk-auth">
    <section class="vk-card auth-card">
      <div class="badge">VK Mini Apps</div>
      <h1 class="vk-title">Складской контур</h1>
      <p class="vk-subtitle">
        Первый мобильный шаг: авторизация и список складов. Дальше перенесём остальные складские страницы.
      </p>

      <div class="vk-meta-panel">
        <div><span>Контейнер:</span> {{ vk.isVkApp ? 'VK Mini Apps' : 'Браузер' }}</div>
        <div><span>Платформа:</span> {{ vk.platform || '—' }}</div>
        <div><span>Scheme:</span> {{ vk.scheme || '—' }}</div>
        <div><span>VK user:</span> {{ vk.user?.first_name ? `${vk.user.first_name} ${vk.user.last_name || ''}`.trim() : '—' }}</div>
      </div>

      <div v-if="auth.loading" class="auth-state">Проверяем сессию...</div>

      <template v-else>
        <div v-if="auth.isAuthenticated" class="auth-user">
          <div class="auth-user-name">{{ userName || 'Пользователь авторизован' }}</div>
          <div class="auth-user-role">{{ auth.roleName }}</div>
        </div>

        <div v-if="auth.error" class="auth-error">{{ auth.error }}</div>

        <button type="button" class="vk-primary-btn" @click="handleLogin">
          {{ auth.isAuthenticated ? 'Войти заново' : 'Войти через SSO' }}
        </button>
      </template>
    </section>
  </main>
</template>
