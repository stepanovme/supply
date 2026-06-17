<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const warehouseName = computed(() => String(route.query.name || 'Склад'))
const warehouseType = computed(() => String(route.query.type || ''))

const sections = [
  { title: 'Склад', caption: 'Остатки и резервы' },
  { title: 'Номенклатура', caption: 'Карточки товаров' },
  { title: 'Приходные накладные', caption: 'Поступления' },
  { title: 'Расходные накладные', caption: 'Списания' },
  { title: 'Возвратные накладные', caption: 'Возвраты на склад' },
  { title: 'Товарные категории', caption: 'Навигация по каталогу' },
]

const goBack = () => {
  router.push('/warehouses')
}
</script>

<template>
  <main class="vk-shell">
    <header class="vk-screen-head">
      <button type="button" class="vk-back-btn" @click="goBack">Назад</button>
      <div>
        <div class="vk-screen-eyebrow">Склад</div>
        <h1 class="vk-screen-title">{{ warehouseName }}</h1>
        <div class="vk-screen-subtitle">{{ warehouseType || 'Мобильный контур в разработке' }}</div>
      </div>
    </header>

    <section class="vk-card intro-card">
      <p>
        Мы подняли первый рабочий шаг для VK Mini Apps: отдельное мобильное приложение с авторизацией и входом в склад.
      </p>
      <p>
        Следующим этапом сюда можно переносить уже готовые складские страницы и адаптировать их под телефон и планшет.
      </p>
    </section>

    <section class="mobile-section-grid">
      <article v-for="section in sections" :key="section.title" class="vk-card mobile-section-card">
        <h2>{{ section.title }}</h2>
        <p>{{ section.caption }}</p>
      </article>
    </section>
  </main>
</template>
