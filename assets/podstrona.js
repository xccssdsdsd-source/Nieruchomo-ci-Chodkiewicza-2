/* Zgoda na Google Analytics na podstronach. Reguły są te same co na stronie
   głównej i korzystają z tego samego wpisu w localStorage, więc decyzja podjęta
   w jednym miejscu obowiązuje w całym serwisie. Baner jest potrzebny także tutaj,
   bo z wyszukiwarki wchodzi się wprost na podstronę, z pominięciem strony głównej.
   GA nie startuje, dopóki nie ma wyraźnego „Akceptuję”. */
(() => {
  const GA_ID = 'G-1Y874153BY'
  const CONSENT_KEY = 'ch2-zgoda-analityka'
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

  window.dataLayer = window.dataLayer || []
  // gtag.js rozpoznaje wpisy po obiekcie `arguments`, stąd zwykła funkcja.
  function gtag () { window.dataLayer.push(arguments) }
  window.gtag = gtag

  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied'
  })

  const readConsent = () => { try { return localStorage.getItem(CONSENT_KEY) } catch { return null } }
  const saveConsent = v => { try { localStorage.setItem(CONSENT_KEY, v) } catch {} }

  let gaLoaded = false
  const loadGA = () => {
    if (gaLoaded) return
    gaLoaded = true
    gtag('consent', 'update', { analytics_storage: 'granted' })
    const sc = document.createElement('script')
    sc.async = true
    sc.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID
    document.head.appendChild(sc)
    gtag('js', new Date())
    gtag('config', GA_ID)
  }

  const box = document.createElement('div')
  box.className = 'consent'
  box.id = 'consent'
  box.hidden = true
  box.setAttribute('role', 'dialog')
  box.setAttribute('aria-modal', 'false')
  box.setAttribute('aria-labelledby', 'consentTxt')
  box.innerHTML = `
    <div class="consent__in">
      <p class="consent__txt" id="consentTxt">
        Chcemy sprawdzać w Google Analytics, które oferty są oglądane — to wymaga zapisania
        plików cookie na Twoim urządzeniu i wysłania danych o wizycie do Google. Bez Twojej zgody
        nic się nie uruchamia, a strona działa tak samo. Szczegóły w
        <a href="/#prywatnosc">polityce prywatności</a>.
      </p>
      <div class="consent__act">
        <button type="button" class="btn btn--outline" id="consentNo">Odrzucam</button>
        <button type="button" class="btn btn--primary" id="consentYes">Akceptuję</button>
      </div>
    </div>`
  document.body.appendChild(box)

  const show = () => {
    box.hidden = false
    document.body.setAttribute('data-consent-open', '')
    requestAnimationFrame(() => box.setAttribute('data-show', ''))
  }

  const hide = () => {
    box.removeAttribute('data-show')
    document.body.removeAttribute('data-consent-open')
    if (reduce) box.hidden = true
    else setTimeout(() => { box.hidden = true }, 360)
  }

  const decide = value => {
    saveConsent(value)
    hide()
    if (value === 'granted') loadGA()
    else gtag('consent', 'update', { analytics_storage: 'denied' })
  }

  box.querySelector('#consentYes').addEventListener('click', () => decide('granted'))
  box.querySelector('#consentNo').addEventListener('click', () => decide('denied'))

  document.querySelectorAll('[data-consent-settings]').forEach(el => el.addEventListener('click', e => {
    e.preventDefault()
    show()
    box.querySelector('#consentNo').focus()
  }))

  const stored = readConsent()
  if (stored === 'granted') loadGA()
  else if (stored !== 'denied') show()
})()

/* Formularz kontaktowy podstrony. Wysyła do /api/lead dokładnie to samo co
   formularz strony głównej (te same pola, pułapka na boty i stempel czasu),
   więc po stronie Workera nic się nie zmienia. Gdy wysyłka zawiedzie, otwiera
   program pocztowy z gotową wiadomością, żeby zapytanie nie przepadło.

   Pomiar kontaktu: zdarzenie GA4 `generate_lead` po kliknięciu numeru
   telefonu, adresu e-mail i po wysłaniu formularza. Wysyłane wyłącznie przy
   zapisanej zgodzie na analitykę, bez niej nie trafia nawet do kolejki.
   Średnik na początku: bez niego ten blok skleja się z poprzednim `})()`. */
;(() => {
  const CONSENT_KEY = 'ch2-zgoda-analityka'
  const consented = () => { try { return localStorage.getItem(CONSENT_KEY) === 'granted' } catch { return false } }
  const track = (source, extra = {}) => {
    if (consented() && typeof window.gtag === 'function') window.gtag('event', 'generate_lead', { lead_source: source, ...extra })
  }

  document.addEventListener('click', e => {
    const link = e.target.closest && e.target.closest('a[href^="tel:"], a[href^="mailto:"]')
    if (link) track(link.getAttribute('href').startsWith('tel:') ? 'telefon' : 'email')
  })

  const form = document.getElementById('leadForm')
  if (!form) return

  const $ = id => document.getElementById(id)
  const okBox = $('formOk')
  const errBox = $('formErr')
  const okText = $('formOkText')
  const errText = $('formErrText')
  const submitBtn = $('formSubmit')
  // Serwer po cichu odrzuca zgłoszenia wysłane szybciej niż w trzy sekundy.
  const openedAt = Date.now()

  const fail = message => {
    errText.textContent = message
    errBox.setAttribute('data-show', '')
    errBox.focus({ preventScroll: true })
  }

  const mailto = d => 'mailto:robertsieradz@wp.pl?subject=' +
    encodeURIComponent('Zapytanie ze strony — ' + d.topic) +
    '&body=' + encodeURIComponent([
      'Imię i nazwisko: ' + d.name,
      'Telefon: ' + (d.phone || '—'),
      'E-mail: ' + d.email,
      'Dotyczy: ' + d.topic,
      '',
      d.message
    ].join('\n'))

  form.addEventListener('submit', async e => {
    e.preventDefault()
    okBox.removeAttribute('data-show')
    errBox.removeAttribute('data-show')

    const d = {
      name: $('f-name').value.trim(),
      phone: $('f-phone').value.trim(),
      email: $('f-email').value.trim(),
      topic: $('f-topic').value,
      message: $('f-msg').value.trim(),
      company: $('f-company').value,
      elapsed: Date.now() - openedAt
    }

    if (!d.name || !d.email || !d.message || !$('f-rodo').checked) {
      return fail('Uzupełnij pola oznaczone gwiazdką i zaznacz zgodę na przetwarzanie danych.')
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) {
      return fail('Sprawdź adres e-mail, wygląda na niepełny.')
    }

    submitBtn.disabled = true
    submitBtn.textContent = 'Wysyłanie…'
    let sent = false
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d)
      })
      sent = res.ok
    } catch {
      sent = false
    }
    submitBtn.disabled = false
    submitBtn.textContent = 'Wyślij wiadomość'

    if (sent) {
      okText.textContent = 'Dziękujemy, wiadomość dotarła. Odezwiemy się najszybciej, jak to możliwe.'
      okBox.setAttribute('data-show', '')
      okBox.focus({ preventScroll: true })
      form.reset()
      track('formularz', { form_topic: d.topic })
    } else {
      window.location.href = mailto(d)
      okText.textContent = 'Otworzyliśmy Twój program pocztowy z gotową wiadomością, wystarczy ją wysłać. Jeśli nic się nie otworzyło, zadzwoń pod 503 444 134 lub napisz na robertsieradz@wp.pl.'
      okBox.setAttribute('data-show', '')
    }
  })
})()
