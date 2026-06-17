# VK Mini Apps: запуск через production URL

Сейчас mini app рассчитан на публикацию по адресу:

- [https://supply.st29.ru/vk-mini/](https://supply.st29.ru/vk-mini/)

Внутри уже есть:

- экран авторизации
- инициализация `VK Bridge`
- базовая диагностика запуска внутри VK
- мобильный список складов
- стартовый экран склада

## Что нужно от тебя

1. Установить зависимости.
2. Собрать mini app.
3. Разместить содержимое `dist` по URL `https://supply.st29.ru/vk-mini/`.
4. Прописать этот URL в кабинете VK Mini Apps.

## Установка зависимостей

```bash
cd /Volumes/www/supply.st29.ru/supply/apps/vk-mini
npm install
```

## Локальная разработка

```bash
cd /Volumes/www/supply.st29.ru/supply/apps/vk-mini
npm run dev
```

Dev-сервер поднимется на:

- `https://localhost:5188/vk-mini/`

Это удобно для локальной проверки верстки и `VK Bridge`, но для реального теста внутри VK лучше использовать уже публичный URL.

## Сборка под production URL

`vite.config.js` уже настроен с:

- `base: '/vk-mini/'`

Поэтому для сборки достаточно:

```bash
cd /Volumes/www/supply.st29.ru/supply/apps/vk-mini
npm run build
```

После этого появится:

- `/Volumes/www/supply.st29.ru/supply/apps/vk-mini/dist`

## Как разложить на сервере

Тебе нужно, чтобы содержимое `dist` открывалось по:

- `https://supply.st29.ru/vk-mini/`

Обычно это означает один из вариантов:

1. Либо скопировать `dist/*` в директорию, которую nginx отдаёт как `/vk-mini/`
2. Либо сделать nginx `alias` на папку `dist`

Пример `nginx` location:

```nginx
location /vk-mini/ {
    alias /var/www/supply.st29.ru/supply/apps/vk-mini/dist/;
    try_files $uri $uri/ /vk-mini/index.html;
}
```

Если у тебя уже есть основной `server` блок для `supply.st29.ru`, этот `location` нужно добавить туда.

## Что указать в кабинете VK

В настройках Mini App:

- `URL для разработки`: `https://supply.st29.ru/vk-mini/`
- `URL приложения`: `https://supply.st29.ru/vk-mini/`

Если кабинет просит отдельно mobile/web, можно указывать тот же URL.

## Как понять, что всё заработало

На экране авторизации и на списке складов уже выводится:

- режим запуска: VK / браузер
- `vk_platform`
- `vk_scheme`
- пользователь из `VKWebAppGetUserInfo`

Если видишь:

- `Контейнер: VK Mini Apps`
- есть `Платформа`
- подтянулся `VK user`

значит `VK Bridge` работает.

## Как проверять

1. Открой [https://supply.st29.ru/vk-mini/](https://supply.st29.ru/vk-mini/) в обычном браузере.
2. Убедись, что открывается экран логина.
3. Затем открой mini app именно из VK.
4. Проверь, что на экране появились VK-параметры и пользователь.
5. Пройди SSO и убедись, что открывается список складов.

## Что делать дальше

Следующий этап:

1. перенести мобильную страницу `Склад`
2. перенести `Номенклатуру`
3. перенести `Приходные / Расходные / Возвратные накладные`
4. затем добавить VK-specific UX:
   - кнопка назад через bridge
   - safe area
   - fullscreen
   - haptics
