<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const formName = ref('')
const formPhone = ref('')
const formEmail = ref('')
const formCompany = ref('')
const formMessage = ref('')
const formSending = ref(false)
const formSent = ref(false)
const formError = ref('')
const mobileMenuOpen = ref(false)

const submitForm = async () => {
  if (!formName.value.trim() || !formPhone.value.trim()) {
    formError.value = 'Пожалуйста, заполните имя и телефон.'
    return
  }
  formSending.value = true
  formError.value = ''
  try {
    const res = await fetch('/apisup/commerce/lead', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formName.value.trim(),
        phone: formPhone.value.trim(),
        email: formEmail.value.trim(),
        company: formCompany.value.trim(),
        message: formMessage.value.trim(),
      }),
    })
    if (!res.ok) throw new Error('send failed')
    formSent.value = true
  } catch {
    formError.value = 'Не удалось отправить. Попробуйте ещё раз или напишите нам на почту.'
  } finally {
    formSending.value = false
  }
}

onMounted(() => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
      }
    })
  }, { threshold: 0.08 })
  document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el))
})

const scrollTo = (id) => {
  mobileMenuOpen.value = false
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}
</script>

<template>
  <div class="landing">
    <header class="header" :class="{ open: mobileMenuOpen }">
      <div class="header-inner">
        <div class="logo">
          <div class="logo-icon"><i class="fas fa-layer-group"></i></div>
          <span class="logo-text">КОПЗАКУПКИ</span>
        </div>
        <button class="hamburger" type="button" @click="mobileMenuOpen = !mobileMenuOpen">
          <span></span><span></span><span></span>
        </button>
        <nav class="header-nav">
          <a href="#" @click.prevent="scrollTo('industries')">Отрасли</a>
          <a href="#" @click.prevent="scrollTo('capabilities')">Возможности</a>
          <a href="#" @click.prevent="scrollTo('roles')">Кому подходит</a>
          <a href="#" @click.prevent="scrollTo('order-form')" class="header-cta-btn">Связаться с нами</a>
        </nav>
      </div>
    </header>

    <section class="hero">
      <div class="hero-bg">
        <div class="hero-glow"></div>
      </div>
      <div class="hero-inner">
        <div class="hero-text">
          <h1>Платформа для управления<br>закупками и снабжением <span class="hl">стройки</span></h1>
          <p class="hero-sub">
            Объедините закупки, счета, склад и доставки в одной системе.<br>
            Перестаньте терять деньги на ошибках в Excel и сорванных сроках.
          </p>
          <div class="hero-actions">
            <button class="btn-primary-hero" type="button" @click="scrollTo('order-form')">Заказать внедрение</button>
            <button class="btn-secondary-hero" type="button" @click="scrollTo('capabilities')">Смотреть возможности</button>
          </div>
          <div class="hero-metrics">
            <div class="metric"><strong>15+</strong><span>лет на рынке</span></div>
            <div class="metric"><strong>300+</strong><span>компаний используют</span></div>
            <div class="metric"><strong>₽2.5+ млрд</strong><span>проведено через систему</span></div>
          </div>
        </div>
        <div class="hero-preview">
          <div class="preview-orb"></div>
          <div class="preview-orb preview-orb-2"></div>
          <div class="preview-window">
            <div class="preview-dots">
              <span></span><span></span><span></span>
            </div>
            <div class="preview-screen">
              <div class="pside">
                <div class="pside-item" v-for="i in 4" :key="i"></div>
              </div>
              <div class="pmain">
                <div class="pmain-top">
                  <div class="pmain-chip"></div>
                  <div class="pmain-chip short"></div>
                  <div class="pmain-chip"></div>
                </div>
                <div class="pmain-rows">
                  <div class="prow" v-for="i in 6" :key="i" :style="{ '--i': i }">
                    <div class="pdot" :class="i > 3 ? 'green' : i > 1 ? 'amber' : ''"></div>
                    <div class="pline" :style="{ width: `${30 + Math.random() * 50}%` }"></div>
                    <div class="pline" :style="{ width: `${15 + Math.random() * 25}%` }"></div>
                    <div class="ppill" :class="i > 3 ? 'green' : ''"></div>
                    <div class="ppill amber"></div>
                  </div>
                </div>
                <div class="preview-status">
                  <div class="ps-bar" style="width: 68%"></div>
                  <span class="ps-label">Загрузка данных...</span>
                </div>
              </div>
            </div>
          </div>
          <div class="pf-float pf-float-1">
            <div class="pf-icon"><i class="fas fa-file-invoice"></i></div>
            <div class="pf-text">
              <strong>Счёт №124</strong>
              <span>ООО «СтройПоставка»</span>
            </div>
          </div>
          <div class="pf-float pf-float-2">
            <div class="pf-icon green"><i class="fas fa-check"></i></div>
            <div class="pf-text">
              <strong>Согласовано</strong>
              <span>12 документов сегодня</span>
            </div>
          </div>
          <div class="pf-float pf-float-3">
            <div class="pf-icon blue"><i class="fas fa-sync-alt"></i></div>
            <div class="pf-text">
              <strong>Синхронизация</strong>
              <span>1С: Бухгалтерия</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="industries" class="section industries" data-reveal>
      <div class="section-inner">
        <h2 class="section-title">Решение для любых задач в строительстве</h2>
        <p class="section-sub">Подрядчики, генподрядчики и застройщики уже автоматизируют закупки с нами</p>
        <div class="industries-grid">
          <div class="ind-card" @click="scrollTo('order-form')">
            <div class="ind-icon"><i class="fas fa-home"></i></div>
            <h3>Малоэтажное строительство</h3>
            <p>Планируйте закупки для каждого дома, контролируйте поставки и не теряйте документы по счетам.</p>
          </div>
          <div class="ind-card" @click="scrollTo('order-form')">
            <div class="ind-icon"><i class="fas fa-tools"></i></div>
            <h3>Монтажные работы</h3>
            <p>Координируйте субподрядчиков, привязывайте фото к работам, фиксируйте объёмы.</p>
          </div>
          <div class="ind-card" @click="scrollTo('order-form')">
            <div class="ind-icon"><i class="fas fa-paint-roller"></i></div>
            <h3>Ремонт и отделка</h3>
            <p>Согласовывайте материалы с заказчиком без мессенджеров. Контролируйте бюджет.</p>
          </div>
          <div class="ind-card" @click="scrollTo('order-form')">
            <div class="ind-icon"><i class="fas fa-city"></i></div>
            <h3>Капитальное строительство</h3>
            <p>Управляйте сложными бюджетами, избегайте кассовых разрывов, контролируйте сотни поставок.</p>
          </div>
          <div class="ind-card" @click="scrollTo('order-form')">
            <div class="ind-icon"><i class="fas fa-road"></i></div>
            <h3>Дорожное строительство</h3>
            <p>Контролируйте линейные объекты на километры, ведите учёт техники и материалов.</p>
          </div>
          <div class="ind-card" @click="scrollTo('order-form')">
            <div class="ind-icon"><i class="fas fa-industry"></i></div>
            <h3>Промышленное строительство</h3>
            <p>Работайте с гигантскими объёмами поставок, управляйте складскими остатками.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section pain" data-reveal>
      <div class="section-inner">
        <div class="pain-grid">
          <div class="pain-visual">
            <div class="pain-card excel">
              <div class="pain-card-head"><i class="fas fa-table"></i> Excel / Google Sheets</div>
              <div class="pain-points">
                <div class="pp">Ошибки в формулах</div>
                <div class="pp">Потеря данных</div>
                <div class="pp">Нет связки заявок и счетов</div>
                <div class="pp">Ручное согласование</div>
              </div>
            </div>
            <div class="pain-vs"><span>VS</span></div>
            <div class="pain-card solution">
              <div class="pain-card-head"><i class="fas fa-layer-group"></i> КОПЗАКУПКИ</div>
              <div class="pain-points">
                <div class="pp ok">Автоматизация закупок</div>
                <div class="pp ok">Единая база счетов</div>
                <div class="pp ok">Согласование в 1 клик</div>
                <div class="pp ok">Склад и доставка онлайн</div>
              </div>
            </div>
          </div>
          <div class="pain-text">
            <h2>Хватит гадать,<br>где деньги</h2>
            <p>«До КОПЗАКУПКИ мы работали в Google Sheets. Несколько сотрудников имели доступ к одной таблице, и кто-то мог случайно удалить важную информацию. Отдел продаж залезал в таблицу сметы — и сумма проекта менялась на порядок. Опасная ситуация для любой компании.»</p>
            <div class="pain-author">
              <div class="pa-avatar"><i class="fas fa-user"></i></div>
              <div><strong>Андрей Иванов</strong><span>Строительная компания</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="capabilities" class="section caps" data-reveal>
      <div class="section-inner">
        <h2 class="section-title">Всё, что нужно для управления снабжением</h2>
        <p class="section-sub">Замените десяток сервисов одним</p>
        <div class="caps-grid">
          <div class="cap-card">
            <div class="cap-num">01</div>
            <div class="cap-icon"><i class="fas fa-file-invoice-dollar"></i></div>
            <h3>Заявки и счета</h3>
            <p>Создавайте заявки на закупку, прикрепляйте счета (PDF/JPG), автоматически распознавайте реквизиты и находите дубликаты.</p>
          </div>
          <div class="cap-card">
            <div class="cap-num">02</div>
            <div class="cap-icon"><i class="fas fa-check-double"></i></div>
            <h3>Согласование</h3>
            <p>Настраивайте цепочки утверждения, получайте уведомления, отслеживайте статусы. Всё прозрачно.</p>
          </div>
          <div class="cap-card">
            <div class="cap-num">03</div>
            <div class="cap-icon"><i class="fas fa-calendar-alt"></i></div>
            <h3>Планирование платежей</h3>
            <p>Планируйте графики оплат, контролируйте остатки, не допускайте просрочек и кассовых разрывов.</p>
          </div>
          <div class="cap-card">
            <div class="cap-num">04</div>
            <div class="cap-icon"><i class="fas fa-warehouse"></i></div>
            <h3>Складской учёт</h3>
            <p>Полный цикл: приход, расход, перемещение, инвентаризация. Номенклатура, категории, остатки онлайн.</p>
          </div>
          <div class="cap-card">
            <div class="cap-num">05</div>
            <div class="cap-icon"><i class="fas fa-truck"></i></div>
            <h3>Доставки</h3>
            <p>Планируйте поставки точно к сроку, отслеживайте статусы, координируйте с поставщиками и прорабами.</p>
          </div>
          <div class="cap-card">
            <div class="cap-num">06</div>
            <div class="cap-icon"><i class="fas fa-comments"></i></div>
            <h3>Чат и уведомления</h3>
            <p>Встроенный WebSocket-чат для каждой заявки. Упоминания, уведомления, история переписки.</p>
          </div>
          <div class="cap-card">
            <div class="cap-num">07</div>
            <div class="cap-icon"><i class="fas fa-file-export"></i></div>
            <h3>Документы и отчёты</h3>
            <p>Excel-выгрузки реестров, закрывающие документы, отчёты по закупкам и бюджетам в пару кликов.</p>
          </div>
          <div class="cap-card">
            <div class="cap-num">08</div>
            <div class="cap-icon"><i class="fas fa-plug"></i></div>
            <h3>Интеграции</h3>
            <p>Open API для интеграции с 1С, CRM и другими системами. Адаптируем под ваши процессы.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section metrics" data-reveal>
      <div class="section-inner">
        <div class="metrics-grid">
          <div class="metrics-item">
            <span class="metrics-num">3x</span>
            <span class="metrics-label">Скорость обработки заявок</span>
          </div>
          <div class="metrics-item">
            <span class="metrics-num">100%</span>
            <span class="metrics-label">Прозрачность закупок</span>
          </div>
          <div class="metrics-item">
            <span class="metrics-num">70%</span>
            <span class="metrics-label">Меньше ошибок в документах</span>
          </div>
          <div class="metrics-item">
            <span class="metrics-num">₽2.5+ млрд</span>
            <span class="metrics-label">Проведено через систему</span>
          </div>
        </div>
      </div>
    </section>

    <section id="roles" class="section roles" data-reveal>
      <div class="section-inner">
        <h2 class="section-title">Один сервис для всей команды</h2>
        <p class="section-sub">Каждый получает то, что нужно для работы</p>
        <div class="roles-grid">
          <div class="role-card">
            <div class="role-avatar"><i class="fas fa-user-tie"></i></div>
            <h3>Руководитель</h3>
            <p>Контролирует закупки удалённо, видит полную картину по проектам, не утопает в рутине.</p>
          </div>
          <div class="role-card">
            <div class="role-avatar"><i class="fas fa-shopping-cart"></i></div>
            <h3>Снабженец</h3>
            <p>Планирует закупки по всем проектам, видит сроки, не допускает простоев.</p>
          </div>
          <div class="role-card">
            <div class="role-avatar"><i class="fas fa-calculator"></i></div>
            <h3>Бухгалтер</h3>
            <p>Контролирует оплаты, сверяет счета, закрывает акты. Вся финансовая информация в одном месте.</p>
          </div>
          <div class="role-card">
            <div class="role-avatar"><i class="fas fa-helmet-safety"></i></div>
            <h3>Прораб</h3>
            <p>Отчитывается о материалах, прикладывает фото, видит график поставок. Не тратит время на бумагу.</p>
          </div>
          <div class="role-card">
            <div class="role-avatar"><i class="fas fa-handshake"></i></div>
            <h3>Клиент / Заказчик</h3>
            <p>Получает ссылку на смету с прогрессом. Прозрачность без лишних встреч.</p>
          </div>
          <div class="role-card">
            <div class="role-avatar"><i class="fas fa-store"></i></div>
            <h3>Поставщик</h3>
            <p>Получает структурированные заявки, отвечает на них прямо в системе. Меньше ошибок в отгрузке.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section app-section" data-reveal>
      <div class="section-inner">
        <div class="app-grid">
          <div class="app-text">
            <h2>Мобильное приложение</h2>
            <p>Прораб отчитывается о выполненных работах и прикладывает фотоотчёт прямо со стройплощадки. Вам не нужно посещать объект, чтобы понять, что там происходит.</p>
            <div class="app-badges">
              <div class="app-badge"><i class="fab fa-app-store-ios"></i> App Store</div>
              <div class="app-badge"><i class="fab fa-google-play"></i> Google Play</div>
            </div>
          </div>
          <div class="app-visual">
            <div class="phone-mockup">
              <div class="phone-notch"></div>
              <div class="phone-content">
                <div class="ph-row" v-for="i in 4" :key="i">
                  <div class="ph-photo"></div>
                  <div class="ph-info"><div class="ph-line"></div><div class="ph-line short"></div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section feedback" data-reveal>
      <div class="section-inner">
        <h2 class="section-title">Нас рекомендуют</h2>
        <div class="feedback-grid">
          <div class="fb-card">
            <div class="fb-stars">
              <i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i>
            </div>
            <p>«Ускорились в 2-3 раза. Автоматизировали весь процесс закупок — от заявки до оплаты. Перестали терять счета и документы.»</p>
            <div class="fb-author">
              <div class="fb-avatar"><i class="fas fa-user"></i></div>
              <div><strong>Дмитрий Соколов</strong><span>Генеральный директор, СтройМаркет</span></div>
            </div>
          </div>
          <div class="fb-card">
            <div class="fb-stars">
              <i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i>
            </div>
            <p>«Раньше акты составляли месяц. Теперь всё формируется автоматически. Экономия времени — колоссальная.»</p>
            <div class="fb-author">
              <div class="fb-avatar"><i class="fas fa-user"></i></div>
              <div><strong>Елена Крылова</strong><span>Финансовый директор, ДомСтрой</span></div>
            </div>
          </div>
          <div class="fb-card">
            <div class="fb-stars">
              <i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i>
            </div>
            <p>«Сократили количество ошибок на проектах в 3-4 раза. Прозрачность закупок теперь 100%. Рекомендую всем коллегам.»</p>
            <div class="fb-author">
              <div class="fb-avatar"><i class="fas fa-user"></i></div>
              <div><strong>Алексей Морозов</strong><span>Технический директор, СК Альянс</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="order-form" class="section form-section" data-reveal>
      <div class="section-inner">
        <div class="form-card">
          <div class="form-icon"><i class="fas fa-paper-plane"></i></div>
          <h2>Начните управлять закупками по-новому</h2>
          <p>Оставьте заявку — и мы покажем, как КОПЗАКУПКИ решит ваши задачи</p>
          <form v-if="!formSent" class="form" @submit.prevent="submitForm">
            <div class="form-grid">
              <label class="ff">
                <span>Имя <span class="req">*</span></span>
                <input v-model="formName" type="text" placeholder="Ваше имя" required>
              </label>
              <label class="ff">
                <span>Телефон <span class="req">*</span></span>
                <input v-model="formPhone" type="tel" placeholder="+7 (___) ___-__-__" required>
              </label>
              <label class="ff">
                <span>Email</span>
                <input v-model="formEmail" type="email" placeholder="your@email.ru">
              </label>
              <label class="ff">
                <span>Компания</span>
                <input v-model="formCompany" type="text" placeholder="Название организации">
              </label>
            </div>
            <label class="ff ff-full">
              <span>Расскажите о ваших задачах</span>
              <textarea v-model="formMessage" rows="3" placeholder="Какие процессы хотите автоматизировать?"></textarea>
            </label>
            <p v-if="formError" class="form-err">{{ formError }}</p>
            <button class="btn-form-submit" type="submit" :disabled="formSending">
              {{ formSending ? 'Отправка...' : 'Отправить заявку' }}
              <i class="fas fa-arrow-right"></i>
            </button>
          </form>
          <div v-else class="form-done">
            <div class="done-icon"><i class="fas fa-check-circle"></i></div>
            <h3>Спасибо за заявку!</h3>
            <p>Мы свяжемся с вами в ближайшее время.</p>
            <button class="btn-secondary-hero" type="button" @click="formSent = false; formName = ''; formPhone = ''; formEmail = ''; formCompany = ''; formMessage = ''">Отправить ещё</button>
          </div>
        </div>
      </div>
    </section>

    <footer class="footer">
      <div class="footer-inner">
        <div class="footer-main">
          <div class="logo">
            <div class="logo-icon"><i class="fas fa-layer-group"></i></div>
            <span class="logo-text">КОПЗАКУПКИ</span>
          </div>
          <p>Система управления закупками, складом и поставками для строительных компаний.</p>
          <div class="footer-contacts">
            <a href="mailto:support@st29.ru"><i class="fas fa-envelope"></i> support@st29.ru</a>
          </div>
        </div>
        <div class="footer-links">
          <div class="fc">
            <h4>Продукт</h4>
            <a href="#" @click.prevent="scrollTo('capabilities')">Возможности</a>
            <a href="#" @click.prevent="scrollTo('industries')">Отрасли</a>
            <a href="#" @click.prevent="scrollTo('roles')">Кому подходит</a>
          </div>
          <div class="fc">
            <h4>Компания</h4>
            <a href="mailto:support@st29.ru">Связаться с нами</a>
            <a href="#">Политика конфиденциальности</a>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        &copy; {{ new Date().getFullYear() }} КОПЗАКУПКИ. Все права защищены.
      </div>
    </footer>
  </div>
</template>

<style scoped>
.landing {
  min-height: 100vh;
  background: #fff;
  color: #0f172a;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  line-height: 1.5;
  overflow-x: hidden;
}

/* ── Header ── */
.header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid #e2e8f0;
}

.header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon {
  width: 32px;
  height: 32px;
  background: #2563eb;
  color: white;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.logo-text {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.hamburger {
  display: none;
  flex-direction: column;
  gap: 4px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
}

.hamburger span {
  width: 22px;
  height: 2px;
  background: #0f172a;
  border-radius: 2px;
  transition: 0.3s;
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 28px;
}

.header-nav a {
  font-size: 13px;
  font-weight: 500;
  color: #64748b;
  text-decoration: none;
  transition: color 0.2s;
  cursor: pointer;
}

.header-nav a:hover {
  color: #2563eb;
}

.header-cta-btn {
  padding: 8px 20px;
  background: #2563eb;
  color: white !important;
  border-radius: 8px;
  font-weight: 600;
  transition: background 0.2s;
}

.header-cta-btn:hover {
  background: #1d4ed8;
}

/* ── Hero ── */
.hero {
  position: relative;
  padding: 140px 24px 80px;
  overflow: hidden;
}

.hero-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 45%, #fff 100%);
  z-index: 0;
  animation: heroBgShift 12s ease-in-out infinite alternate;
}

@keyframes heroBgShift {
  0% { background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 45%, #fff 100%); }
  50% { background: linear-gradient(135deg, #f0f7ff 0%, #f8fafc 45%, #fff 100%); }
  100% { background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 45%, #fff 100%); }
}

.hero-glow {
  position: absolute;
  top: -30%;
  right: -10%;
  width: 700px;
  height: 700px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(37,99,235,0.07) 0%, transparent 65%);
  pointer-events: none;
  animation: glowPulse 5s ease-in-out infinite;
}

@keyframes glowPulse {
  0%, 100% { transform: scale(1) translate(0, 0); opacity: 0.7; }
  50% { transform: scale(1.15) translate(-20px, -20px); opacity: 1; }
}

.hero-inner {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 60px;
  align-items: center;
  position: relative;
  z-index: 1;
}

.hero-text h1 {
  font-size: 44px;
  font-weight: 800;
  line-height: 1.12;
  letter-spacing: -1px;
  margin-bottom: 20px;
  opacity: 0;
  transform: translateY(20px);
  animation: heroTextIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards;
}

@keyframes heroTextIn {
  to { opacity: 1; transform: translateY(0); }
}

.hl {
  color: #2563eb;
  position: relative;
}

.hl::after {
  content: '';
  position: absolute;
  bottom: 3px;
  left: 0;
  right: 0;
  height: 10px;
  background: rgba(37,99,235,0.12);
  border-radius: 5px;
}

.hero-sub {
  font-size: 17px;
  color: #64748b;
  line-height: 1.65;
  margin-bottom: 32px;
  opacity: 0;
  transform: translateY(16px);
  animation: heroTextIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards;
}

.hero-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 48px;
  flex-wrap: wrap;
}

.hero-actions .btn-primary-hero,
.hero-actions .btn-secondary-hero {
  opacity: 0;
  transform: translateY(16px) scale(0.95);
  animation: heroBtnIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.hero-actions .btn-primary-hero { animation-delay: 0.35s; }
.hero-actions .btn-secondary-hero { animation-delay: 0.5s; }

@keyframes heroBtnIn {
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.btn-primary-hero {
  padding: 13px 32px;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s;
  font-family: inherit;
}

.btn-primary-hero:hover {
  background: #1d4ed8;
  transform: translateY(-1px);
  box-shadow: 0 8px 25px rgba(37,99,235,0.25);
}

.btn-secondary-hero {
  padding: 13px 32px;
  background: white;
  color: #0f172a;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s;
  font-family: inherit;
}

.btn-secondary-hero:hover {
  border-color: #2563eb;
  color: #2563eb;
}

.hero-metrics {
  display: flex;
  gap: 36px;
  flex-wrap: wrap;
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  opacity: 0;
  transform: translateY(16px);
  animation: metricFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.metric:nth-child(1) { animation-delay: 0.3s; }
.metric:nth-child(2) { animation-delay: 0.45s; }
.metric:nth-child(3) { animation-delay: 0.6s; }

@keyframes metricFade {
  to { opacity: 1; transform: translateY(0); }
}

.metric strong {
  font-size: 22px;
  font-weight: 700;
}

.metric span {
  font-size: 12px;
  color: #64748b;
}

.hero-preview {
  position: relative;
}

.preview-window {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: white;
  box-shadow: 0 25px 70px rgba(0,0,0,0.07);
  overflow: hidden;
  opacity: 0;
  transform: translateY(20px) scale(0.97);
  animation: previewIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.15s forwards;
}

@keyframes previewIn {
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.preview-dots {
  display: flex;
  gap: 6px;
  padding: 14px 16px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.preview-dots span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.preview-dots span:nth-child(1) { background: #ef4444; }
.preview-dots span:nth-child(2) { background: #f59e0b; }
.preview-dots span:nth-child(3) { background: #22c55e; }

.preview-screen {
  display: grid;
  grid-template-columns: 100px 1fr;
  min-height: 280px;
}

.pside {
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pside-item {
  height: 12px;
  background: #e2e8f0;
  border-radius: 4px;
}

.pside-item:nth-child(1) { width: 70%; }
.pside-item:nth-child(2) { width: 85%; }
.pside-item:nth-child(3) { width: 55%; }
.pside-item:nth-child(4) { width: 80%; }

.pmain {
  padding: 14px;
}

.pmain-top {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.pmain-chip {
  height: 20px;
  width: 80px;
  background: #f1f5f9;
  border-radius: 6px;
}

.pmain-chip.short {
  width: 50px;
}

.pmain-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.prow {
  display: flex;
  align-items: center;
  gap: 8px;
  animation: prowFade 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: calc(var(--i) * 0.07s);
}

@keyframes prowFade {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.pdot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #cbd5e1;
  flex-shrink: 0;
}
.pdot.amber { background: #f59e0b; }
.pdot.green { background: #22c55e; }

.pline {
  height: 8px;
  background: #f1f5f9;
  border-radius: 4px;
}

.ppill {
  width: 44px;
  height: 16px;
  background: #f1f5f9;
  border-radius: 999px;
  flex-shrink: 0;
  margin-left: auto;
}
.ppill.green { background: #dcfce7; }
.ppill.amber { background: #fef3c7; }

/* ── Sections Common ── */
.section {
  padding: 90px 24px;
}

.section-inner {
  max-width: 1100px;
  margin: 0 auto;
}

.section-title {
  font-size: 32px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 10px;
  letter-spacing: -0.5px;
}

.section-sub {
  font-size: 16px;
  color: #64748b;
  text-align: center;
  margin-bottom: 52px;
}

/* ── Industries ── */
.industries {
  background: #fff;
}

.industries-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.ind-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 28px 24px;
  cursor: pointer;
  transition: all 0.3s;
}

.ind-card:hover {
  background: #fff;
  border-color: #2563eb;
  box-shadow: 0 8px 30px rgba(37,99,235,0.08);
  transform: translateY(-3px);
}

.ind-icon {
  width: 44px;
  height: 44px;
  background: #eff6ff;
  color: #2563eb;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  margin-bottom: 16px;
}

.ind-card h3 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}

.ind-card p {
  font-size: 14px;
  color: #64748b;
  line-height: 1.6;
}

/* ── Pain ── */
.pain {
  background: #f8fafc;
}

.pain-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 50px;
  align-items: center;
}

.pain-visual {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.pain-card {
  width: 100%;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  background: white;
  padding: 20px 24px;
}

.pain-card.excel {
  border-color: #fca5a5;
  background: #fef2f2;
}

.pain-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 14px;
}

.pain-card-head i {
  font-size: 16px;
}

.pain-card.solution .pain-card-head {
  color: #2563eb;
}

.pain-points {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pp {
  font-size: 13px;
  color: #475569;
  padding: 6px 10px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.pp.ok {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #166534;
}

.pp.ok::before {
  content: '✓';
  margin-right: 6px;
  font-weight: 700;
}

.pain-vs {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
  color: #64748b;
  font-weight: 600;
}

.pain-vs::before,
.pain-vs::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e2e8f0;
}

.pain-vs span {
  background: #e2e8f0;
  padding: 4px 14px;
  border-radius: 999px;
  font-size: 11px;
}

.pain-text h2 {
  font-size: 30px;
  font-weight: 700;
  margin-bottom: 16px;
  letter-spacing: -0.5px;
}

.pain-text p {
  font-size: 14px;
  color: #475569;
  line-height: 1.7;
  font-style: italic;
  margin-bottom: 20px;
}

.pain-author {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pa-avatar {
  width: 40px;
  height: 40px;
  background: #e2e8f0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
}

.pain-author strong {
  display: block;
  font-size: 13px;
}

.pain-author span {
  font-size: 12px;
  color: #64748b;
}

/* ── Capabilities ── */
.caps {
  background: #fff;
}

.caps-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

.cap-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 28px 22px;
  position: relative;
  transition: all 0.3s;
}

.cap-card:hover {
  background: #fff;
  border-color: #2563eb;
  box-shadow: 0 8px 25px rgba(37,99,235,0.07);
  transform: translateY(-2px);
}

.cap-num {
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  margin-bottom: 12px;
}

.cap-icon {
  font-size: 22px;
  color: #2563eb;
  margin-bottom: 14px;
}

.cap-card h3 {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 8px;
}

.cap-card p {
  font-size: 13px;
  color: #64748b;
  line-height: 1.6;
}

/* ── Metrics ── */
.metrics {
  background: #0f172a;
}

.metrics .section-inner {
  max-width: 1000px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 30px;
}

.metrics-item {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.metrics-num {
  font-size: 38px;
  font-weight: 800;
  color: #2563eb;
  line-height: 1;
}

.metrics-label {
  font-size: 13px;
  color: #94a3b8;
}

/* ── Roles ── */
.roles {
  background: #fff;
}

.roles-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.role-card {
  text-align: center;
  padding: 32px 20px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  transition: all 0.3s;
}

.role-card:hover {
  box-shadow: 0 8px 30px rgba(0,0,0,0.05);
  transform: translateY(-2px);
}

.role-avatar {
  width: 56px;
  height: 56px;
  background: #eff6ff;
  color: #2563eb;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  margin: 0 auto 14px;
}

.role-card h3 {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 8px;
}

.role-card p {
  font-size: 13px;
  color: #64748b;
  line-height: 1.6;
}

/* ── App Section ── */
.app-section {
  background: #f8fafc;
}

.app-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 50px;
  align-items: center;
}

.app-text h2 {
  font-size: 30px;
  font-weight: 700;
  margin-bottom: 14px;
}

.app-text p {
  font-size: 15px;
  color: #475569;
  line-height: 1.7;
  margin-bottom: 28px;
}

.app-badges {
  display: flex;
  gap: 12px;
}

.app-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: #0f172a;
  color: white;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.app-badge:hover {
  background: #1e293b;
}

.app-badge i {
  font-size: 16px;
}

.phone-mockup {
  width: 220px;
  margin: 0 auto;
  border: 3px solid #e2e8f0;
  border-radius: 28px;
  background: white;
  overflow: hidden;
  box-shadow: 0 15px 40px rgba(0,0,0,0.08);
}

.phone-notch {
  height: 24px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.phone-content {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 320px;
}

.ph-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.ph-photo {
  width: 50px;
  height: 50px;
  background: #f1f5f9;
  border-radius: 10px;
  flex-shrink: 0;
}

.ph-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ph-line {
  height: 8px;
  background: #f1f5f9;
  border-radius: 4px;
  width: 100%;
}

.ph-line.short {
  width: 60%;
}

/* ── Feedback ── */
.feedback {
  background: #fff;
}

.feedback-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.fb-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 28px 24px;
  transition: all 0.3s;
}

.fb-card:hover {
  box-shadow: 0 8px 25px rgba(0,0,0,0.04);
}

.fb-stars {
  display: flex;
  gap: 3px;
  margin-bottom: 14px;
  color: #f59e0b;
  font-size: 13px;
}

.fb-card p {
  font-size: 13px;
  color: #475569;
  line-height: 1.7;
  font-style: italic;
  margin-bottom: 16px;
}

.fb-author {
  display: flex;
  align-items: center;
  gap: 10px;
}

.fb-avatar {
  width: 36px;
  height: 36px;
  background: #e2e8f0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  font-size: 14px;
}

.fb-author strong {
  display: block;
  font-size: 12px;
}

.fb-author span {
  font-size: 11px;
  color: #64748b;
}

/* ── Form ── */
.form-section {
  background: #f8fafc;
}

.form-card {
  max-width: 640px;
  margin: 0 auto;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  padding: 48px 40px;
  text-align: center;
  box-shadow: 0 4px 20px rgba(0,0,0,0.04);
}

.form-icon {
  font-size: 40px;
  color: #2563eb;
  margin-bottom: 16px;
}

.form-card h2 {
  font-size: 26px;
  font-weight: 700;
  margin-bottom: 8px;
}

.form-card > p {
  font-size: 14px;
  color: #64748b;
  margin-bottom: 32px;
}

.form {
  text-align: left;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 14px;
}

.ff {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  font-weight: 500;
}

.ff-full {
  margin-bottom: 14px;
}

.ff input,
.ff textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 14px;
  font-family: inherit;
  background: #fff;
  transition: all 0.2s;
}

.ff input:focus,
.ff textarea:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
}

.ff textarea {
  resize: vertical;
  min-height: 80px;
}

.req { color: #ef4444; }

.form-err {
  font-size: 13px;
  color: #ef4444;
  margin-bottom: 12px;
}

.btn-form-submit {
  width: 100%;
  justify-content: center;
  padding: 13px;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: inherit;
  transition: all 0.25s;
}

.btn-form-submit:hover {
  background: #1d4ed8;
  box-shadow: 0 8px 25px rgba(37,99,235,0.25);
}

.btn-form-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-done {
  padding: 20px 0;
}

.done-icon {
  font-size: 56px;
  color: #22c55e;
  margin-bottom: 14px;
}

.form-done h3 {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 8px;
}

.form-done p {
  font-size: 15px;
  color: #64748b;
  margin-bottom: 24px;
}

/* ── Footer ── */
.footer {
  background: #0f172a;
  color: white;
  padding: 48px 24px 0;
}

.footer-inner {
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 60px;
  padding-bottom: 32px;
}

.footer .logo-icon {
  background: rgba(255,255,255,0.08);
  color: white;
}

.footer .logo-text {
  color: white;
}

.footer-main p {
  font-size: 13px;
  color: #94a3b8;
  margin-top: 12px;
  max-width: 300px;
  line-height: 1.6;
}

.footer-contacts {
  margin-top: 16px;
}

.footer-contacts a {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #94a3b8;
  font-size: 13px;
  text-decoration: none;
  transition: color 0.2s;
}

.footer-contacts a:hover {
  color: white;
}

.footer-links {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
}

.fc h4 {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 14px;
  color: #e2e8f0;
}

.fc a {
  display: block;
  font-size: 13px;
  color: #94a3b8;
  margin-bottom: 8px;
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s;
}

.fc a:hover {
  color: white;
}

.footer-bottom {
  border-top: 1px solid rgba(255,255,255,0.06);
  padding: 16px 24px;
  text-align: center;
  font-size: 12px;
  color: #64748b;
}

/* ── Responsive ── */
@media (max-width: 1000px) {
  .hero-inner { grid-template-columns: 1fr; }
  .hero-preview { display: none; }
  .pain-grid { grid-template-columns: 1fr; }
  .caps-grid { grid-template-columns: repeat(2, 1fr); }
  .industries-grid { grid-template-columns: repeat(2, 1fr); }
  .roles-grid { grid-template-columns: repeat(2, 1fr); }
  .app-grid { grid-template-columns: 1fr; }
  .feedback-grid { grid-template-columns: 1fr; }
  .footer-inner { grid-template-columns: 1fr; }
}

@media (max-width: 700px) {
  .header-nav {
    display: none;
    position: absolute;
    top: 64px;
    left: 0;
    right: 0;
    background: white;
    flex-direction: column;
    padding: 16px 24px;
    border-bottom: 1px solid #e2e8f0;
    gap: 14px;
  }

  .header.open .header-nav { display: flex; }
  .hamburger { display: flex; }

  .hero-text h1 { font-size: 30px; }
  .section-title { font-size: 26px; }
  .industries-grid { grid-template-columns: 1fr; }
  .caps-grid { grid-template-columns: 1fr; }
  .metrics-grid { grid-template-columns: repeat(2, 1fr); gap: 20px; }
  .roles-grid { grid-template-columns: 1fr; }
  .form-grid { grid-template-columns: 1fr; }
  .form-card { padding: 32px 20px; }
  .footer-links { grid-template-columns: 1fr; }
  .hero-metrics { gap: 20px; }
  .metrics-num { font-size: 28px; }
}

/* ── Scroll Reveal ── */
[data-reveal] {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}
[data-reveal].visible {
  opacity: 1;
  transform: translateY(0);
}

[data-reveal] .section-title,
[data-reveal] .section-sub {
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.7s cubic-bezier(0.16, 1, 0.3, 1);
}
[data-reveal].visible .section-title,
[data-reveal].visible .section-sub {
  opacity: 1;
  transform: translateY(0);
}
[data-reveal].visible .section-sub {
  transition-delay: 0.12s;
}

[data-reveal] .ind-card,
[data-reveal] .cap-card,
[data-reveal] .role-card,
[data-reveal] .fb-card {
  opacity: 0;
  transform: translateY(24px);
  transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}
[data-reveal].visible .ind-card,
[data-reveal].visible .cap-card,
[data-reveal].visible .role-card,
[data-reveal].visible .fb-card {
  opacity: 1;
  transform: translateY(0);
}

.ind-card:nth-child(1),
.cap-card:nth-child(1),
.role-card:nth-child(1),
.fb-card:nth-child(1) { transition-delay: 0s; }
.ind-card:nth-child(2),
.cap-card:nth-child(2),
.role-card:nth-child(2),
.fb-card:nth-child(2) { transition-delay: 0.07s; }
.ind-card:nth-child(3),
.cap-card:nth-child(3),
.role-card:nth-child(3),
.fb-card:nth-child(3) { transition-delay: 0.14s; }
.ind-card:nth-child(4),
.cap-card:nth-child(4),
.role-card:nth-child(4) { transition-delay: 0.21s; }
.ind-card:nth-child(5),
.cap-card:nth-child(5),
.role-card:nth-child(5) { transition-delay: 0.28s; }
.ind-card:nth-child(6),
.cap-card:nth-child(6),
.role-card:nth-child(6) { transition-delay: 0.35s; }
.cap-card:nth-child(7) { transition-delay: 0.42s; }
.cap-card:nth-child(8) { transition-delay: 0.49s; }

[data-reveal] .pain-card,
[data-reveal] .pain-text {
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.7s cubic-bezier(0.16, 1, 0.3, 1);
}
[data-reveal].visible .pain-card,
[data-reveal].visible .pain-text {
  opacity: 1;
  transform: translateY(0);
}
[data-reveal].visible .pain-text {
  transition-delay: 0.15s;
}

[data-reveal] .metrics-item {
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}
[data-reveal].visible .metrics-item {
  opacity: 1;
  transform: translateY(0);
}
.metrics-item:nth-child(1) { transition-delay: 0s; }
.metrics-item:nth-child(2) { transition-delay: 0.1s; }
.metrics-item:nth-child(3) { transition-delay: 0.2s; }
.metrics-item:nth-child(4) { transition-delay: 0.3s; }

[data-reveal] .app-text,
[data-reveal] .app-visual {
  opacity: 0;
  transform: translateY(24px);
  transition: all 0.7s cubic-bezier(0.16, 1, 0.3, 1);
}
[data-reveal].visible .app-text,
[data-reveal].visible .app-visual {
  opacity: 1;
  transform: translateY(0);
}
[data-reveal].visible .app-visual {
  transition-delay: 0.15s;
}

[data-reveal] .form-card {
  opacity: 0;
  transform: translateY(24px) scale(0.97);
  transition: all 0.7s cubic-bezier(0.16, 1, 0.3, 1);
}
[data-reveal].visible .form-card {
  opacity: 1;
  transform: translateY(0) scale(1);
}

/* ── Preview Orb ── */
.preview-orb {
  position: absolute;
  top: 10%;
  right: 5%;
  width: 420px;
  height: 420px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, rgba(37,99,235,0.12), rgba(37,99,235,0.03) 60%, transparent 75%);
  pointer-events: none;
  animation: orbFloat 6s ease-in-out infinite;
  z-index: 0;
}
.preview-orb-2 {
  top: auto;
  bottom: -10%;
  right: auto;
  left: -10%;
  width: 300px;
  height: 300px;
  background: radial-gradient(circle at 70% 70%, rgba(99,102,241,0.10), rgba(99,102,241,0.02) 55%, transparent 70%);
  animation: orbFloat 8s ease-in-out infinite reverse;
}

@keyframes orbFloat {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(15px, -20px) scale(1.08); }
  66% { transform: translate(-10px, 10px) scale(0.95); }
}

/* ── Preview Status Bar ── */
.preview-status {
  margin-top: 16px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.ps-bar {
  height: 4px;
  background: linear-gradient(90deg, #2563eb, #6366f1);
  border-radius: 4px;
  animation: psLoad 1.8s ease-in-out infinite;
}
@keyframes psLoad {
  0%, 100% { width: 68%; }
  50% { width: 88%; }
}
.ps-label {
  font-size: 10px;
  color: #94a3b8;
  font-weight: 500;
  white-space: nowrap;
}

/* ── Floating Preview Cards ── */
.pf-float {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 10px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 14px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.08);
  z-index: 2;
  opacity: 0;
  animation: pfFadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards,
             pfFloat 5s ease-in-out infinite;
}

.pf-float-1 {
  top: -12px;
  left: -30px;
  animation-delay: 0.1s, 1s;
}
.pf-float-2 {
  bottom: 40px;
  right: -20px;
  animation-delay: 0.3s, 1.6s;
}
.pf-float-3 {
  top: 50%;
  right: -35px;
  animation-delay: 0.5s, 2.2s;
}

@keyframes pfFadeIn {
  to { opacity: 1; }
}

@keyframes pfFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

.pf-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: #eff6ff;
  color: #2563eb;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  flex-shrink: 0;
}
.pf-icon.green {
  background: #f0fdf4;
  color: #22c55e;
}
.pf-icon.blue {
  background: #f8fafc;
  color: #6366f1;
}
.pf-text strong {
  display: block;
  font-size: 12px;
  font-weight: 600;
}
.pf-text span {
  font-size: 10px;
  color: #64748b;
}

/* ── Phone Photo Placeholders ── */
.ph-photo {
  background: linear-gradient(135deg, #cbd5e1, #e2e8f0);
  border-radius: 8px;
  position: relative;
  overflow: hidden;
}
.ph-photo::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg,
    rgba(255,255,255,0.3) 0%, transparent 40%,
    transparent 60%, rgba(0,0,0,0.05) 100%);
  border-radius: inherit;
}
.ph-row:nth-child(1) .ph-photo { background: linear-gradient(135deg, #93c5fd, #60a5fa); }
.ph-row:nth-child(2) .ph-photo { background: linear-gradient(135deg, #86efac, #4ade80); }
.ph-row:nth-child(3) .ph-photo { background: linear-gradient(135deg, #fde68a, #facc15); }
.ph-row:nth-child(4) .ph-photo { background: linear-gradient(135deg, #c4b5fd, #a78bfa); }

/* ── Enhanced Hover Effects ── */
.ind-card,
.cap-card,
.role-card,
.fb-card {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1) !important;
}
.ind-card:hover,
.cap-card:hover,
.role-card:hover,
.fb-card:hover {
  transform: translateY(-6px) !important;
  box-shadow: 0 12px 40px rgba(37,99,235,0.10) !important;
}

.btn-primary-hero {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.btn-primary-hero:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 35px rgba(37,99,235,0.3);
}
.btn-secondary-hero {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.btn-secondary-hero:hover {
  transform: translateY(-2px);
}

/* ── Mobile menu slide ── */
.header-nav {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
@media (max-width: 700px) {
  .header-nav {
    opacity: 0;
    transform: translateY(-8px);
    pointer-events: none;
  }
  .header.open .header-nav {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
}
</style>
