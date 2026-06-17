<script setup>
import { ref } from 'vue'
import TopNav from '../components/layout/TopNav.vue'
import { mainNavLinks } from '../constants/mainNav'

const navLinks = mainNavLinks

const orgType = ref('ООО')
const isInternal = ref(false)

const company = ref({
  inn: '',
  shortName: '',
  fullName: '',
  prefix: '',
  kpp: '',
  ogrn: '',
  ogrnip: '',
  okpo: '',
  okogu: '',
  okato: '',
  oktmo: '',
  okfs: '',
  okopf: '',
  taxSystem: '',
  okvedMain: '',
  okvedExtra: [''],
  legalAddress: '',
  actualAddress: '',
  postAddress: '',
})

const director = ref({
  lastName: '',
  firstName: '',
  middleName: '',
  position: '',
  phonePersonal: '',
  phoneWork: '',
  phoneExtra: '',
  emailPersonal: '',
  emailWork: '',
  emailExtra: '',
  birthday: '',
  comment: '',
})

const individual = ref({
  lastName: '',
  firstName: '',
  middleName: '',
  passportSeries: '',
  passportNumber: '',
  passportIssuedBy: '',
  passportIssueDate: '',
  passportDepartmentCode: '',
  birthPlace: '',
  birthDate: '',
  regAddress: '',
  factAddress: '',
  phone: '',
  email: '',
})

const accounts = ref([
  {
    name: '',
    rs: '',
    bic: '',
    ks: '',
    bankName: '',
    isPrimary: true,
  },
])

const errorMessage = ref('')
const successMessage = ref('')
const saving = ref(false)
let errorTimer = null
let successTimer = null

const showError = (message) => {
  errorMessage.value = message
  if (errorTimer) clearTimeout(errorTimer)
  errorTimer = setTimeout(() => {
    errorMessage.value = ''
  }, 3000)
}

const showSuccess = (message) => {
  successMessage.value = message
  if (successTimer) clearTimeout(successTimer)
  successTimer = setTimeout(() => {
    successMessage.value = ''
  }, 3000)
}

const formatCodeName = (value) => {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (value.Код || value.Наим) {
    return `${value.Код || ''} - ${value.Наим || ''}`.trim()
  }
  return ''
}

const splitFio = (fio) => {
  if (!fio) return { lastName: '', firstName: '', middleName: '' }
  const parts = fio.split(' ').filter(Boolean)
  return {
    lastName: parts[0] || '',
    firstName: parts[1] || '',
    middleName: parts[2] || '',
  }
}

const formatPhoneMask = (value) => {
  const digits = String(value || '').replace(/\D/g, '')
  const normalized = digits.startsWith('8') ? `7${digits.slice(1)}` : digits
  const body = normalized.startsWith('7') ? normalized.slice(1, 11) : normalized.slice(0, 10)
  const part1 = body.slice(0, 3)
  const part2 = body.slice(3, 6)
  const part3 = body.slice(6, 8)
  const part4 = body.slice(8, 10)

  let result = '+7'
  if (part1) result += ` (${part1}`
  if (part1.length === 3) result += ')'
  if (part2) result += ` ${part2}`
  if (part3) result += `-${part3}`
  if (part4) result += `-${part4}`
  return result
}

const onIndividualPhoneInput = (event) => {
  individual.value.phone = formatPhoneMask(event?.target?.value || individual.value.phone)
}

const normalizeEmail = (value) => String(value || '').trim()

const isValidEmail = (value) => {
  const email = normalizeEmail(value)
  if (!email) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const loadCompanyByInn = async () => {
  if (!company.value.inn) return
  try {
    const searchRes = await fetch(`/apiref/ref/counterparties/search?q=${encodeURIComponent(company.value.inn)}`, {
      credentials: 'include',
    })
    if (!searchRes.ok) throw new Error('Search failed')
    const searchData = await searchRes.json()
    const exists = Array.isArray(searchData) ? searchData.length > 0 : (searchData.items || []).length > 0
    if (exists) {
      showError('Данный контрагент уже занесён в систему.')
      return
    }

    const checkoRes = await fetch(
      `https://api.checko.ru/v2/company?key=KH5xnbpESrTvNr4Z&inn=${encodeURIComponent(company.value.inn)}`
    )
    if (!checkoRes.ok) throw new Error('Checko failed')
    const checkoJson = await checkoRes.json()
    const data = checkoJson?.data
    if (!data) return

    company.value.shortName = data.НаимСокр || ''
    company.value.fullName = data.НаимПолн || ''
    company.value.kpp = data.КПП || ''
    company.value.ogrn = data.ОГРН || ''
    company.value.okpo = formatCodeName(data.ОКПО)
    company.value.okogu = formatCodeName(data.ОКОГУ)
    company.value.okato = formatCodeName(data.ОКАТО)
    company.value.oktmo = formatCodeName(data.ОКТМО)
    company.value.okfs = formatCodeName(data.ОКФС)
    company.value.okopf = formatCodeName(data.ОКОПФ)
    company.value.taxSystem = Array.isArray(data.Налоги?.ОсобРежим)
      ? data.Налоги.ОсобРежим.join(', ')
      : ''
    if (data.ОКВЭД) {
      company.value.okvedMain = `${data.ОКВЭД.Код || ''} - ${data.ОКВЭД.Наим || ''}`.trim()
    }
    if (Array.isArray(data.ОКВЭДДоп)) {
      company.value.okvedExtra = data.ОКВЭДДоп.map(
        (o) => `${o.Код || ''} - ${o.Наим || ''}`.trim()
      )
      if (company.value.okvedExtra.length === 0) company.value.okvedExtra = ['']
    }
    company.value.legalAddress = data.ЮрАдрес?.АдресРФ || ''

    if (Array.isArray(data.Руковод) && data.Руковод.length > 0) {
      const fio = splitFio(data.Руковод[0].ФИО)
      director.value.lastName = fio.lastName
      director.value.firstName = fio.firstName
      director.value.middleName = fio.middleName
      director.value.position = data.Руковод[0].НаимДолжн || ''
    }
  } catch (error) {
    showError('Не удалось получить данные по ИНН.')
  }
}

const loadEntrepreneurByInn = async () => {
  if (!company.value.inn) return
  try {
    const searchRes = await fetch(`/apiref/ref/counterparties/search?q=${encodeURIComponent(company.value.inn)}`, {
      credentials: 'include',
    })
    if (!searchRes.ok) throw new Error('Search failed')
    const searchData = await searchRes.json()
    const exists = Array.isArray(searchData) ? searchData.length > 0 : (searchData.items || []).length > 0
    if (exists) {
      showError('Данный контрагент уже занесён в систему.')
      return
    }

    const checkoRes = await fetch(
      `https://api.checko.ru/v2/entrepreneur?key=KH5xnbpESrTvNr4Z&inn=${encodeURIComponent(company.value.inn)}`
    )
    if (!checkoRes.ok) throw new Error('Checko failed')
    const checkoJson = await checkoRes.json()
    const data = checkoJson?.data
    if (!data) return

    const fio = splitFio(data.ФИО)
    company.value.shortName = `${data.ТипСокр || ''} ${data.ФИО || ''}`.trim()
    company.value.fullName = `${data.Тип || ''} ${data.ФИО || ''}`.trim()
    company.value.ogrnip = data.ОГРНИП || ''
    company.value.okpo = formatCodeName(data.ОКПО)
    company.value.okogu = formatCodeName(data.ОКОГУ)
    company.value.okato = formatCodeName(data.ОКАТО)
    company.value.oktmo = formatCodeName(data.ОКТМО)
    company.value.okfs = formatCodeName(data.ОКФС)
    company.value.okopf = formatCodeName(data.ОКОПФ)
    if (data.ОКВЭД) {
      company.value.okvedMain = `${data.ОКВЭД.Код || ''} - ${data.ОКВЭД.Наим || ''}`.trim()
    }
    if (Array.isArray(data.ОКВЭДДоп)) {
      company.value.okvedExtra = data.ОКВЭДДоп.map(
        (o) => `${o.Код || ''} - ${o.Наим || ''}`.trim()
      )
      if (company.value.okvedExtra.length === 0) company.value.okvedExtra = ['']
    }

    director.value.lastName = fio.lastName
    director.value.firstName = fio.firstName
    director.value.middleName = fio.middleName
    director.value.position = data.ТипСокр || ''
  } catch (error) {
    showError('Не удалось получить данные по ИНН.')
  }
}

const addOkved = () => company.value.okvedExtra.push('')
const removeOkved = (index) => company.value.okvedExtra.splice(index, 1)

const addAccount = () =>
  accounts.value.push({
    name: '',
    rs: '',
    bic: '',
    ks: '',
    bankName: '',
    isPrimary: false,
  })

const removeAccount = (index) => accounts.value.splice(index, 1)

const onBicChange = async (account) => {
  if (!account.bic) return
  try {
    const res = await fetch(
      `https://api.checko.ru/v2/bank?key=KH5xnbpESrTvNr4Z&bic=${encodeURIComponent(account.bic)}`
    )
    if (!res.ok) throw new Error('Bank lookup failed')
    const json = await res.json()
    const data = json?.data
    if (!data) return
    account.ks = data.КорСчет?.Номер || ''
    account.bankName = data.Наим || ''
  } catch (error) {
    showError('Не удалось получить данные банка по БИК.')
  }
}

const createCounterparty = async () => {
  if (saving.value) return

  if (orgType.value === 'Физлицо') {
    if (!String(individual.value.lastName || '').trim() || !String(individual.value.firstName || '').trim()) {
      showError('Для физ. лица обязательны только поля "Имя" и "Фамилия".')
      return
    }
    if (!isValidEmail(individual.value.email)) {
      showError('Введите корректный email.')
      return
    }
    individual.value.email = normalizeEmail(individual.value.email)
    individual.value.phone = formatPhoneMask(individual.value.phone)
    if (!company.value.shortName.trim()) {
      company.value.shortName = [individual.value.lastName, individual.value.firstName, individual.value.middleName]
        .filter(Boolean)
        .join(' ')
    }
    if (!company.value.fullName.trim()) {
      company.value.fullName = company.value.shortName
    }
  }

  saving.value = true
  try {
    const typeMap = { 'ООО': 'LLC', 'ИП': 'IP', 'Физлицо': 'PHYSIC' }
    const cpRes = await fetch('/apiref/ref/counterparties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        type: typeMap[orgType.value],
        short_name: company.value.shortName,
        full_name: company.value.fullName,
        is_internal: isInternal.value,
        contract_prefix: isInternal.value ? company.value.prefix : '',
      }),
    })
    if (!cpRes.ok) throw new Error('counterparties')
    const cpJson = await cpRes.json()
    const counterpartyId = cpJson.id || cpJson.counterparty_id
    if (!counterpartyId) throw new Error('counterparty_id')

    const personRes = await fetch('/apiref/ref/persons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name: orgType.value === 'Физлицо' ? individual.value.firstName : director.value.firstName,
        last_naem: orgType.value === 'Физлицо' ? individual.value.lastName : director.value.lastName,
        middle_name: orgType.value === 'Физлицо' ? individual.value.middleName : director.value.middleName,
        phone_personal: orgType.value === 'Физлицо' ? '' : director.value.phonePersonal,
        email_personal: orgType.value === 'Физлицо' ? '' : director.value.emailPersonal,
        birth_date: orgType.value === 'Физлицо'
          ? (individual.value.birthDate || null)
          : (director.value.birthday || null),
      }),
    })
    if (!personRes.ok) throw new Error('person')
    const personJson = await personRes.json()
    const personId = personJson.id || personJson.person_id
    if (!personId) throw new Error('person_id')

    if (orgType.value === 'ООО') {
      const llcRes = await fetch('/apiref/ref/counterparties/llc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          counterparties_id: counterpartyId,
          inn: company.value.inn,
          kpp: company.value.kpp,
          ogrn: company.value.ogrn,
          okpo: company.value.okpo,
          okogu: company.value.okogu,
          okato: company.value.okato,
          oktmo: company.value.oktmo,
          okfs: company.value.okfs,
          okopf: company.value.okopf,
          tax_system: company.value.taxSystem,
          okved: company.value.okvedMain,
          legal_address: company.value.legalAddress,
          actual_address: company.value.actualAddress,
          postal_address: company.value.postAddress,
          director_person_id: personId,
          director_basis: '',
        }),
      })
      if (!llcRes.ok) throw new Error('llc')
    }

    if (orgType.value === 'ИП') {
      const ipRes = await fetch('/apiref/ref/counterparties/ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          counterparty_id: counterpartyId,
          inn: company.value.inn,
          ogrnip: company.value.ogrnip,
          okpo: company.value.okpo,
          okved: company.value.okvedMain,
          okopf: company.value.okopf,
          okfs: company.value.okfs,
          okogu: company.value.okogu,
          okato: company.value.okato,
          oktmo: company.value.oktmo,
          person_id: personId,
        }),
      })
      if (!ipRes.ok) throw new Error('ip')
    }

    if (orgType.value === 'Физлицо') {
      const physRes = await fetch('/apiref/ref/counterparties/phys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          counterparty_id: counterpartyId,
          person_id: personId,
          passport_series: individual.value.passportSeries,
          passport_number: individual.value.passportNumber,
          passport_issued_by: individual.value.passportIssuedBy,
          passport_date_issued: individual.value.passportIssueDate,
          passport_date: individual.value.passportIssueDate,
          department_code: individual.value.passportDepartmentCode,
          inn: company.value.inn,
          address_registration: individual.value.regAddress,
          address_living: individual.value.factAddress,
          phone: individual.value.phone,
          email: individual.value.email,
        }),
      })
      if (!physRes.ok) throw new Error('phys')
    }

    if (orgType.value !== 'Физлицо') {
      const extras = (company.value.okvedExtra || []).filter((v) => v && v.trim())
      for (const okved of extras) {
        await fetch('/apiref/ref/counterparties/additional-okved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            counterparty_id: counterpartyId,
            additional_okved: okved,
          }),
        })
      }
    }

    if (orgType.value !== 'Физлицо') {
      for (const acc of accounts.value) {
        await fetch(`/apiref/ref/counterparties/${counterpartyId}/bank-accounts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            counterparty_id: counterpartyId,
            bank_name: acc.bankName,
            bik: acc.bic,
            correspondent_account: acc.ks,
            account_number: acc.rs,
            account_name: acc.name,
            is_main: acc.isPrimary,
          }),
        })
      }
    }

    await fetch('/apiref/ref/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        counterparty_id: counterpartyId,
        person_id: personId,
        position: director.value.position,
        phone_work: director.value.phoneWork,
        phone_extra: director.value.phoneExtra,
        email_work: director.value.emailWork,
        email_extra: director.value.emailExtra,
        role_type: 'owner',
        comment: director.value.comment,
      }),
    })

    showSuccess('Контрагент успешно создан.')
  } catch (error) {
    showError('Не удалось создать контрагента.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />
    <main class="main-content">
      <div class="content-header">
        <h1 class="page-title">Создание организации</h1>
      </div>

      <div class="panel">
        <div class="field">
          <label>Тип организации</label>
          <div class="type-buttons">
            <button :class="{ active: orgType === 'ООО' }" @click="orgType = 'ООО'">ООО</button>
            <button :class="{ active: orgType === 'ИП' }" @click="orgType = 'ИП'">ИП</button>
            <button :class="{ active: orgType === 'Физлицо' }" @click="orgType = 'Физлицо'">Физ. лицо</button>
          </div>
        </div>
      </div>

      <div v-if="orgType === 'ООО'" class="panel">
        <h2 class="section-title">Информация о компании</h2>
        <div class="form-grid">
          <div class="field">
            <label>ИНН</label>
            <div class="inline">
              <input v-model="company.inn" type="text">
              <button class="btn" @click="loadCompanyByInn">Заполнить</button>
            </div>
          </div>
          <div class="field">
            <label>Краткое наименование</label>
            <input v-model="company.shortName" type="text">
          </div>
          <div class="field">
            <label>Полное наименование</label>
            <input v-model="company.fullName" type="text">
          </div>
          <div class="field">
            <label>Внутренняя компания</label>
            <select v-model="isInternal">
              <option :value="true">Да</option>
              <option :value="false">Нет</option>
            </select>
          </div>
          <div class="field" v-if="isInternal">
            <label>Префикс для договоров</label>
            <input v-model="company.prefix" type="text">
          </div>
          <div class="field"><label>КПП</label><input v-model="company.kpp" type="text"></div>
          <div class="field"><label>ОГРН</label><input v-model="company.ogrn" type="text"></div>
          <div class="field"><label>ОКПО</label><input v-model="company.okpo" type="text"></div>
          <div class="field"><label>ОКОГУ</label><input v-model="company.okogu" type="text"></div>
          <div class="field"><label>ОКАТО</label><input v-model="company.okato" type="text"></div>
          <div class="field"><label>ОКТМО</label><input v-model="company.oktmo" type="text"></div>
          <div class="field"><label>ОКФС</label><input v-model="company.okfs" type="text"></div>
          <div class="field"><label>ОКОПФ</label><input v-model="company.okopf" type="text"></div>
          <div class="field"><label>Система налогообложения</label><input v-model="company.taxSystem" type="text"></div>
          <div class="field"><label>Основной ОКВЭД</label><input v-model="company.okvedMain" type="text"></div>
        </div>

        <div class="subsection">
          <label>Доп. ОКВЭД</label>
          <div class="okved-list">
            <div v-for="(okved, idx) in company.okvedExtra" :key="idx" class="okved-row">
              <input v-model="company.okvedExtra[idx]" type="text" class="okved-input">
              <button class="btn ghost" @click="removeOkved(idx)">Удалить</button>
            </div>
          </div>
          <button class="btn" @click="addOkved">Добавить ОКВЭД</button>
        </div>

        <div class="form-grid">
          <div class="field"><label>Юридический адрес</label><input v-model="company.legalAddress" type="text"></div>
          <div class="field"><label>Фактический адрес</label><input v-model="company.actualAddress" type="text"></div>
          <div class="field"><label>Почтовый адрес</label><input v-model="company.postAddress" type="text"></div>
        </div>
      </div>

      <div v-if="orgType === 'ООО'" class="panel">
        <h2 class="section-title">Руководитель</h2>
        <div class="form-grid">
          <div class="field"><label>Фамилия</label><input v-model="director.lastName" type="text"></div>
          <div class="field"><label>Имя</label><input v-model="director.firstName" type="text"></div>
          <div class="field"><label>Отчество</label><input v-model="director.middleName" type="text"></div>
          <div class="field"><label>Должность</label><input v-model="director.position" type="text"></div>
          <div class="field"><label>Телефон личный</label><input v-model="director.phonePersonal" type="text"></div>
          <div class="field"><label>Телефон рабочий</label><input v-model="director.phoneWork" type="text"></div>
          <div class="field"><label>Телефон доп.</label><input v-model="director.phoneExtra" type="text"></div>
          <div class="field"><label>Email личный</label><input v-model="director.emailPersonal" type="text"></div>
          <div class="field"><label>Email рабочий</label><input v-model="director.emailWork" type="text"></div>
          <div class="field"><label>Email доп.</label><input v-model="director.emailExtra" type="text"></div>
          <div class="field"><label>Дата рождения</label><input v-model="director.birthday" type="date"></div>
          <div class="field"><label>Комментарий</label><input v-model="director.comment" type="text"></div>
        </div>
      </div>

      <div v-if="orgType === 'ООО'" class="panel">
        <h2 class="section-title">Счета</h2>
        <div class="accounts">
          <div v-for="(acc, idx) in accounts" :key="idx" class="account-card">
            <div class="form-grid">
              <div class="field"><label>Название счета</label><input v-model="acc.name" type="text"></div>
              <div class="field"><label>Расчётный счёт</label><input v-model="acc.rs" type="text"></div>
              <div class="field"><label>БИК</label><input v-model="acc.bic" type="text" @change="onBicChange(acc)"></div>
              <div class="field"><label>Корреспондентский счёт</label><input v-model="acc.ks" type="text"></div>
              <div class="field"><label>Наименование банка</label><input v-model="acc.bankName" type="text"></div>
              <div class="field">
                <label>Сделать основным</label>
                <input type="checkbox" v-model="acc.isPrimary">
              </div>
            </div>
            <button class="btn ghost" @click="removeAccount(idx)" v-if="accounts.length > 1">Удалить счет</button>
          </div>
        </div>
        <button class="btn" @click="addAccount">Добавить счет</button>
      </div>

      <template v-if="orgType === 'ИП'">
        <div class="panel">
          <h2 class="section-title">Информация о компании</h2>
          <div class="form-grid">
            <div class="field">
              <label>ИНН</label>
              <div class="inline">
                <input v-model="company.inn" type="text">
                <button class="btn" @click="loadEntrepreneurByInn">Заполнить</button>
              </div>
            </div>
            <div class="field"><label>Краткое наименование</label><input v-model="company.shortName" type="text"></div>
            <div class="field"><label>Полное наименование</label><input v-model="company.fullName" type="text"></div>
            <div class="field">
              <label>Внутренняя компания</label>
              <select v-model="isInternal">
                <option :value="true">Да</option>
                <option :value="false">Нет</option>
              </select>
            </div>
            <div class="field" v-if="isInternal">
              <label>Префикс для договоров</label>
              <input v-model="company.prefix" type="text">
            </div>
            <div class="field"><label>ОГРНИП</label><input v-model="company.ogrnip" type="text"></div>
            <div class="field"><label>ОКПО</label><input v-model="company.okpo" type="text"></div>
            <div class="field"><label>ОКОГУ</label><input v-model="company.okogu" type="text"></div>
            <div class="field"><label>ОКАТО</label><input v-model="company.okato" type="text"></div>
            <div class="field"><label>ОКТМО</label><input v-model="company.oktmo" type="text"></div>
            <div class="field"><label>ОКФС</label><input v-model="company.okfs" type="text"></div>
            <div class="field"><label>ОКОПФ</label><input v-model="company.okopf" type="text"></div>
            <div class="field"><label>Система налогообложения</label><input v-model="company.taxSystem" type="text"></div>
            <div class="field"><label>Основной ОКВЭД</label><input v-model="company.okvedMain" type="text"></div>
          </div>

          <div class="subsection">
            <label>Доп. ОКВЭД</label>
            <div class="okved-list">
              <div v-for="(okved, idx) in company.okvedExtra" :key="`ip-okved-${idx}`" class="okved-row">
                <input v-model="company.okvedExtra[idx]" type="text" class="okved-input">
                <button class="btn ghost" @click="removeOkved(idx)">Удалить</button>
              </div>
            </div>
            <button class="btn" @click="addOkved">Добавить ОКВЭД</button>
          </div>
        </div>

        <div class="panel">
          <h2 class="section-title">Руководитель</h2>
          <div class="form-grid">
            <div class="field"><label>Фамилия</label><input v-model="director.lastName" type="text"></div>
            <div class="field"><label>Имя</label><input v-model="director.firstName" type="text"></div>
            <div class="field"><label>Отчество</label><input v-model="director.middleName" type="text"></div>
            <div class="field"><label>Должность</label><input v-model="director.position" type="text"></div>
            <div class="field"><label>Телефон личный</label><input v-model="director.phonePersonal" type="text"></div>
            <div class="field"><label>Телефон рабочий</label><input v-model="director.phoneWork" type="text"></div>
            <div class="field"><label>Телефон доп.</label><input v-model="director.phoneExtra" type="text"></div>
            <div class="field"><label>Email личный</label><input v-model="director.emailPersonal" type="text"></div>
            <div class="field"><label>Email рабочий</label><input v-model="director.emailWork" type="text"></div>
            <div class="field"><label>Email доп.</label><input v-model="director.emailExtra" type="text"></div>
            <div class="field"><label>Дата рождения</label><input v-model="director.birthday" type="date"></div>
            <div class="field"><label>Комментарий</label><input v-model="director.comment" type="text"></div>
          </div>
        </div>

        <div class="panel">
          <h2 class="section-title">Счета</h2>
          <div class="accounts">
            <div v-for="(acc, idx) in accounts" :key="`ip-acc-${idx}`" class="account-card">
              <div class="form-grid">
                <div class="field"><label>Название счета</label><input v-model="acc.name" type="text"></div>
                <div class="field"><label>Расчётный счёт</label><input v-model="acc.rs" type="text"></div>
                <div class="field"><label>БИК</label><input v-model="acc.bic" type="text" @change="onBicChange(acc)"></div>
                <div class="field"><label>Корреспондентский счёт</label><input v-model="acc.ks" type="text"></div>
                <div class="field"><label>Наименование банка</label><input v-model="acc.bankName" type="text"></div>
                <div class="field">
                  <label>Сделать основным</label>
                  <input type="checkbox" v-model="acc.isPrimary">
                </div>
              </div>
              <button class="btn ghost" @click="removeAccount(idx)" v-if="accounts.length > 1">Удалить счет</button>
            </div>
          </div>
          <button class="btn" @click="addAccount">Добавить счет</button>
        </div>
      </template>

      <div v-if="orgType === 'Физлицо'" class="panel">
        <h2 class="section-title">Физическое лицо</h2>
        <div class="form-grid">
          <div class="field"><label>Фамилия</label><input v-model="individual.lastName" type="text"></div>
          <div class="field"><label>Имя</label><input v-model="individual.firstName" type="text"></div>
          <div class="field"><label>Отчество</label><input v-model="individual.middleName" type="text"></div>
          <div class="field"><label>Серия паспорта</label><input v-model="individual.passportSeries" type="text"></div>
          <div class="field"><label>Номер паспорта</label><input v-model="individual.passportNumber" type="text"></div>
          <div class="field"><label>Кем выдано</label><input v-model="individual.passportIssuedBy" type="text"></div>
          <div class="field"><label>Дата выдачи</label><input v-model="individual.passportIssueDate" type="date"></div>
          <div class="field"><label>Код подразделения</label><input v-model="individual.passportDepartmentCode" type="text"></div>
          <div class="field"><label>Место рождения</label><input v-model="individual.birthPlace" type="text"></div>
          <div class="field"><label>Дата рождения</label><input v-model="individual.birthDate" type="date"></div>
          <div class="field"><label>Адрес регистрации</label><input v-model="individual.regAddress" type="text"></div>
          <div class="field"><label>Адрес фактического проживания</label><input v-model="individual.factAddress" type="text"></div>
          <div class="field"><label>Телефон</label><input :value="individual.phone" type="tel" placeholder="+7 (___) ___-__-__" maxlength="18" @input="onIndividualPhoneInput"></div>
          <div class="field"><label>Email</label><input v-model.trim="individual.email" type="email" placeholder="name@example.com"></div>
        </div>
      </div>

      <div class="panel actions-footer">
        <button class="btn btn-primary" :disabled="saving" @click="createCounterparty">
          {{ saving ? 'Создание...' : 'Создать' }}
        </button>
      </div>
    </main>

    <div v-if="errorMessage" class="error-popup">
      {{ errorMessage }}
    </div>
    <div v-if="successMessage" class="success-popup">
      {{ successMessage }}
    </div>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  padding: 24px 32px;
  gap: 16px;
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.panel {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-sm);
  padding: 16px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.field label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.field input,
.field textarea,
.field select {
  width: 100%;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  font-size: 12px;
}

.inline {
  display: flex;
  gap: 8px;
}

.type-buttons {
  display: flex;
  gap: 8px;
}

.type-buttons button {
  padding: 6px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  cursor: pointer;
}

.type-buttons button.active {
  background: var(--brand-light);
  color: var(--brand-primary);
  border-color: var(--brand-primary);
}

.subsection {
  margin-top: 16px;
}

.okved-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}

.okved-row {
  display: flex;
  gap: 8px;
}

.okved-input {
  flex: 1;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  font-size: 12px;
}

.accounts {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.account-card {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 12px;
  background: var(--bg-subtle);
}

.btn.ghost {
  background: transparent;
  border: 1px solid var(--border-light);
}

.empty-state {
  color: var(--text-secondary);
  font-size: 12px;
}

.error-popup {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--danger-bg);
  color: var(--danger-text);
  border: 1px solid #fecaca;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  font-size: 12px;
  z-index: 200;
}

.success-popup {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--success-bg);
  color: var(--success-text);
  border: 1px solid #bbf7d0;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  font-size: 12px;
  z-index: 200;
}

.actions-footer {
  display: flex;
  justify-content: flex-end;
}
</style>
