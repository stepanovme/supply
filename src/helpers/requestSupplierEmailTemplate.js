const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const normalizeText = (value) => String(value ?? '').trim()

const formatDate = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return escapeHtml(value)
  return date.toLocaleDateString('ru-RU')
}

const formatDateTime = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return escapeHtml(value)
  return date.toLocaleString('ru-RU')
}

const buildLines = (items) => {
  const list = Array.isArray(items) ? items : []
  if (!list.length) {
    return '<tr><td colspan="4" style="padding:18px 16px;color:#6b7280;font-size:14px;text-align:center;">Позиции не добавлены</td></tr>'
  }

  return list.map((item, index) => {
    const name = escapeHtml(normalizeText(item?.name || item?.nomenclature_name || item?.title || '')) || '—'
    const quantity = escapeHtml(normalizeText(item?.quantity ?? '')) || '—'
    const unit = escapeHtml(normalizeText(item?.unit_name || item?.unit || item?.measure || '')) || '—'
    const comment = escapeHtml(normalizeText(item?.comment || '')) || '—'
    return `
      <tr>
        <td style="padding:14px 12px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;vertical-align:top;">${index + 1}</td>
        <td style="padding:14px 12px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;vertical-align:top;">${name}</td>
        <td style="padding:14px 12px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;vertical-align:top;text-align:center;white-space:nowrap;">${quantity}</td>
        <td style="padding:14px 12px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;vertical-align:top;white-space:nowrap;">${unit}</td>
        <td style="padding:14px 12px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;vertical-align:top;">${comment}</td>
      </tr>
    `
  }).join('')
}

const buildRecipientList = (items) => {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return '<span style="color:#6b7280;">—</span>'
  return list.map((item) => {
    const email = escapeHtml(normalizeText(item?.email || ''))
    const fio = escapeHtml(normalizeText(item?.fio || ''))
    const company = escapeHtml(normalizeText(item?.company_name || ''))
    const label = [fio, email].filter(Boolean).join(' · ')
    return `<div style="padding:8px 12px;border:1px solid #dbe4f0;border-radius:12px;background:#f8fbff;margin-bottom:8px;color:#0f172a;font-size:14px;line-height:1.45;"><strong style="display:block;font-weight:700;color:#0f172a;">${label || email || '—'}</strong>${company ? `<span style="display:block;color:#475569;margin-top:2px;">${company}</span>` : ''}</div>`
  }).join('')
}

export const buildRequestSupplierEmailHtml = (data = {}) => {
  const requestNumber = escapeHtml(normalizeText(data.requestNumber || data.request_id || '—'))
  const requestDate = formatDate(data.requestDate || data.created_at || data.request_created_at)
  const projectName = escapeHtml(normalizeText(data.projectName || data.project_name || '—'))
  const payerName = escapeHtml(normalizeText(data.payerName || data.payer_name || '—'))
  const recipientName = escapeHtml(normalizeText(data.recipientName || data.recipient_name || '—'))
  const deliveryRequired = data.deliveryRequired === true || data.deliveryRequired === 'true' || data.deliveryRequired === 1 ? 'Да' : 'Нет'
  const deliveryDate = formatDate(data.deliveryDate || data.delivery_date)
  const deadline = formatDateTime(data.deadline)
  const daysDelay = normalizeText(data.daysDelay ?? data.days_delay ?? '') || '—'
  const deliveryTo = escapeHtml(normalizeText(data.deliveryTo || data.delivery_to || '—'))
  const commentRequest = escapeHtml(normalizeText(data.commentRequest || data.comment_request || '')) || '—'
  const commentSupplier = escapeHtml(normalizeText(data.commentSupplier || data.comment_supplier || '')) || '—'
  const senderEmail = escapeHtml(normalizeText(data.senderEmail || data.sender_email || '—'))
  const recipientsHtml = buildRecipientList(data.recipients || data.suppliers || [])
  const itemsHtml = buildLines(data.items)

  return `
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Запрос поставщику №${requestNumber}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f6fb;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="width:680px;max-width:680px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 12px 30px rgba(15,23,42,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:28px 32px;color:#ffffff;">
                <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.88;margin-bottom:8px;">Запрос поставщику</div>
                <div style="font-size:26px;line-height:1.25;font-weight:700;margin:0 0 8px;">Заявка №${requestNumber}</div>
                <div style="font-size:14px;line-height:1.6;opacity:0.95;">${projectName}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 12px;">
                <div style="font-size:15px;line-height:1.7;color:#334155;">
                  Уважаемые поставщики, направляем вам запрос на предоставление предложения по заявке.
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;border-spacing:12px;">
                  <tr>
                    <td style="width:50%;vertical-align:top;">
                      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:18px 18px 16px;">
                        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Реквизиты заявки</div>
                        <div style="font-size:14px;line-height:1.7;color:#0f172a;">
                          <div><strong>Дата заявки:</strong> ${requestDate}</div>
                          <div><strong>Плательщик:</strong> ${payerName}</div>
                          <div><strong>Грузополучатель:</strong> ${recipientName}</div>
                          <div><strong>Проект:</strong> ${projectName}</div>
                        </div>
                      </div>
                    </td>
                    <td style="width:50%;vertical-align:top;">
                      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:18px 18px 16px;">
                        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Условия поставки</div>
                        <div style="font-size:14px;line-height:1.7;color:#0f172a;">
                          <div><strong>Доставка требуется:</strong> ${deliveryRequired}</div>
                          <div><strong>Требуемая дата доставки:</strong> ${deliveryDate}</div>
                          <div><strong>Отсрочка платежа:</strong> ${daysDelay} дн.</div>
                          <div><strong>Срок подачи предложения до:</strong> ${deadline}</div>
                          <div><strong>Адрес доставки:</strong> ${deliveryTo}</div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px;">
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:18px;">
                  <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Комментарий к заявке</div>
                  <div style="font-size:14px;line-height:1.7;color:#0f172a;white-space:pre-line;">${commentRequest}</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px;">
                <div style="background:#fff;border:1px solid #dbe4f0;border-radius:18px;overflow:hidden;">
                  <div style="padding:18px 20px 12px;border-bottom:1px solid #e2e8f0;background:#f8fafc;">
                    <div style="font-size:18px;font-weight:700;color:#0f172a;">Позиции заявки</div>
                    <div style="font-size:13px;color:#64748b;margin-top:4px;">Список позиций, отправленных поставщику</div>
                  </div>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                    <thead>
                      <tr>
                        <th style="padding:12px;border-bottom:1px solid #e5e7eb;background:#f8fafc;color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;text-align:left;">№</th>
                        <th style="padding:12px;border-bottom:1px solid #e5e7eb;background:#f8fafc;color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;text-align:left;">Наименование</th>
                        <th style="padding:12px;border-bottom:1px solid #e5e7eb;background:#f8fafc;color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;text-align:center;">Кол-во</th>
                        <th style="padding:12px;border-bottom:1px solid #e5e7eb;background:#f8fafc;color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;text-align:left;">Ед. изм.</th>
                        <th style="padding:12px;border-bottom:1px solid #e5e7eb;background:#f8fafc;color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;text-align:left;">Комментарий</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${itemsHtml}
                    </tbody>
                  </table>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px;">
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:18px;">
                  <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Комментарий к поставщику</div>
                  <div style="font-size:14px;line-height:1.7;color:#0f172a;white-space:pre-line;">${commentSupplier}</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;border-spacing:12px;">
                  <tr>
                    <td style="width:50%;vertical-align:top;">
                      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:18px;">
                        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Почта отправителя</div>
                        <div style="font-size:15px;line-height:1.7;color:#0f172a;word-break:break-word;">${senderEmail}</div>
                      </div>
                    </td>
                    <td style="width:50%;vertical-align:top;">
                      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:18px;">
                        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Поставщики</div>
                        ${recipientsHtml}
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                <div style="border-top:1px solid #e2e8f0;padding-top:20px;font-size:12px;line-height:1.6;color:#64748b;">
                  Письмо сформировано автоматически системой Supply. Если у вас есть вопросы по содержанию запроса, пожалуйста, свяжитесь с ответственным менеджером.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `
}

export default buildRequestSupplierEmailHtml
