import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Supply Docs',
  description: 'Документация по системе снабжения',
  lang: 'ru-RU',
  base: '/docs/',
  cleanUrls: true,
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Главная', link: '/' },
      { text: 'Заявки', link: '/guide/requests/lifecycle' },
      { text: 'Счета', link: '/guide/invoices' },
      { text: 'Склад', link: '/guide/warehouse' },
      { text: 'Сделки', link: '/guide/deals' },
      { text: 'Доставки', link: '/guide/deliveries' }
    ],
    sidebar: [
      {
        text: 'Введение',
        collapsed: false,
        items: [
          { text: 'Обзор', link: '/guide/intro' }
        ]
      },
      {
        text: 'Заявки',
        collapsed: false,
        items: [
          { text: 'Жизненный цикл заявки', link: '/guide/requests/lifecycle' },
          { text: 'Реестр заявок', link: '/guide/requests/registry' }
        ]
      },
      {
        text: 'Счета',
        collapsed: true,
        items: [
          { text: 'Обзор', link: '/guide/invoices' }
        ]
      },
      {
        text: 'Склад',
        collapsed: true,
        items: [
          { text: 'Обзор', link: '/guide/warehouse' }
        ]
      },
      {
        text: 'Сделки',
        collapsed: true,
        items: [
          { text: 'Обзор', link: '/guide/deals' }
        ]
      },
      {
        text: 'Доставки',
        collapsed: true,
        items: [
          { text: 'Обзор', link: '/guide/deliveries' }
        ]
      }
    ],
    outline: {
      level: [2, 3],
      label: 'На этой странице'
    },
    search: {
      provider: 'local'
    }
  }
})
