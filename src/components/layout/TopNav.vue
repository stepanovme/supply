<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'

const props = defineProps({
  links: {
    type: Array,
    required: true,
  },
  notificationCounts: {
    type: Object,
    default: () => ({
      requests: 0,
      invoices: 0,
      deliveries: 0,
    }),
  },
})

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const chat = useChatStore()

const isActive = (link) => {
  if (!link.path) return false
  return route.path === link.path || route.path.startsWith(`${link.path}/`)
}
const fullName = computed(() => {
  if (!auth.user) return ''
  const parts = [auth.user.surname, auth.user.name].filter(Boolean)
  return parts.join(' ')
})
const initials = computed(() => {
  if (!auth.user) return ''
  const first = auth.user.name ? auth.user.name[0] : ''
  const last = auth.user.surname ? auth.user.surname[0] : ''
  return `${last}${first}`.toUpperCase()
})

const openUserProfile = () => {
  const userId = auth.user?.id || auth.user?.user_id
  if (!userId) return
  router.push({ name: 'user-profile', params: { userId } })
}

const notificationsOpen = ref(false)
const notificationsRef = ref(null)
const feedbackOpen = ref(false)
const feedbackRef = ref(null)
const supportUrl = import.meta.env.VITE_SUPPORT_URL || 'mailto:support@st29.ru'
const wikiUrl = import.meta.env.VITE_WIKI_URL || '/docs/'
const notificationsTotal = computed(() =>
  Number(props.notificationCounts?.requests || 0)
  + Number(chat.badgeCounts?.total || 0)
  + Number(props.notificationCounts?.deliveries || 0)
)

const toggleNotifications = () => {
  notificationsOpen.value = !notificationsOpen.value
  if (notificationsOpen.value) feedbackOpen.value = false
}

const toggleFeedback = () => {
  feedbackOpen.value = !feedbackOpen.value
  if (feedbackOpen.value) notificationsOpen.value = false
}

const closeNotificationsOutside = (event) => {
  const el = notificationsRef.value
  const target = event.target
  if (!el || !(target instanceof Node) || !el.contains(target)) {
    notificationsOpen.value = false
  }
  const fb = feedbackRef.value
  if (!fb || !(target instanceof Node) || !fb.contains(target)) {
    feedbackOpen.value = false
  }
}

onMounted(() => {
  window.addEventListener('mousedown', closeNotificationsOutside)
  chat.checkGlobalMentions()
  chat.connectWebSocket()
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', closeNotificationsOutside)
  chat.disconnectWebSocket()
})
</script>

<template>
  <nav class="top-nav">
    <div class="nav-left">
      <div class="nav-brand">
        <div class="brand-icon"><i class="fas fa-layer-group"></i></div>
        <span>КОПЗАКУПКИ</span>
      </div>
      <div class="nav-links">
        <template v-for="link in links" :key="link.label">
          <RouterLink
            v-if="link.path"
            :to="link.path"
            class="nav-item"
            :class="{ active: isActive(link) }"
          >
            {{ link.label }}
          </RouterLink>
          <span v-else class="nav-item is-disabled">{{ link.label }}</span>
        </template>
      </div>
    </div>
    <div class="nav-right">
      <div ref="notificationsRef" class="notif-wrap">
        <button class="icon-btn" type="button" aria-label="Уведомления" @click.stop="toggleNotifications">
          <i class="fas fa-bell"></i>
          <span v-if="notificationsTotal > 0" class="notif-dot"></span>
        </button>
        <div v-if="notificationsOpen" class="notif-menu">
          <div class="notif-item">
            <span>Заявки</span>
            <strong>{{ notificationCounts.requests || 0 }}</strong>
          </div>
          <div class="notif-item" @click="router.push('/invoices/groups'); notificationsOpen = false">
            <span>Счета</span>
            <strong>{{ chat.badgeCounts.total || 0 }}</strong>
          </div>
          <div class="notif-item">
            <span>Доставки</span>
            <strong>{{ notificationCounts.deliveries || 0 }}</strong>
          </div>
        </div>
      </div>
      <div ref="feedbackRef" class="notif-wrap">
        <button class="icon-btn" type="button" aria-label="Обратная связь" @click.stop="toggleFeedback">
          <i class="fas fa-circle-question"></i>
        </button>
        <div v-if="feedbackOpen" class="notif-menu feedback-menu">
          <a class="notif-item feedback-link" :href="wikiUrl" @click="feedbackOpen = false">
            <span>Вики</span>
          </a>
          <a class="notif-item feedback-link" :href="supportUrl" target="_blank" rel="noopener">
            <span>Написать нам</span>
          </a>
        </div>
      </div>
      <button class="icon-btn" type="button" aria-label="Чаты" @click="router.push('/chats')">
        <i class="fas fa-comment-dots"></i>
        <span v-if="chat.hasUnviewedMentions" class="notif-dot" style="background:var(--danger-text,#ef4444)"></span>
      </button>
      <div class="divider"></div>
      <button class="user-profile" type="button" @click="openUserProfile">
        <div class="user-meta">
          <div class="user-name">{{ fullName }}</div>
          <div class="user-role">{{ auth.roleName }}</div>
        </div>
        <div class="avatar">{{ initials }}</div>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.top-nav {
  height: var(--nav-height);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  flex-shrink: 0;
  z-index: 100;
}

.nav-left {
  display: flex;
  align-items: center;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.5px;
}

.brand-icon {
  background: var(--brand-primary);
  color: white;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  margin-left: 32px;
}

.nav-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  text-decoration: none;
  font-weight: 500;
  font-size: 13px;
  transition: all 0.2s;
}

.nav-item:hover {
  color: var(--text-primary);
  background: var(--bg-subtle);
}

.nav-item.active {
  color: var(--brand-primary);
  background: var(--brand-light);
  font-weight: 600;
}

.nav-item.is-disabled {
  cursor: default;
  opacity: 0.6;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.divider {
  width: 1px;
  height: 24px;
  background: var(--border-light);
}

.icon-btn {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
}

.notif-wrap {
  position: relative;
}

.notif-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 220px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  z-index: 160;
  padding: 6px;
}

.notif-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-primary);
}

.feedback-menu {
  min-width: 190px;
}

.feedback-link {
  text-decoration: none;
  color: inherit;
}

.notif-item:hover {
  background: var(--bg-subtle);
}

.notif-item strong {
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  color: var(--text-secondary);
}

.icon-btn:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.notif-dot {
  position: absolute;
  top: 6px;
  right: 7px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--danger-text);
  border: 1px solid var(--bg-surface);
}

.user-profile {
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  color: inherit;
  font: inherit;
  padding: 0;
}

.user-profile:hover .user-name {
  color: var(--brand-primary);
}

.user-meta {
  text-align: right;
  line-height: 1.2;
}

.user-name {
  font-weight: 600;
  font-size: 12px;
}

.user-role {
  font-size: 10px;
  color: var(--text-secondary);
}

.avatar {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #475569 0%, #0f172a 100%);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 12px;
  border: 2px solid white;
  box-shadow: var(--shadow-sm);
}
</style>
