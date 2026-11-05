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
