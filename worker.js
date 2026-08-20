/**
 * Worker obsługujący stronę Chodkiewicza 2.
 *
 * Cloudflare wdraża ten projekt poleceniem `wrangler deploy`, czyli jako
 * Workera ze statycznymi zasobami — katalog `functions/` z czasów Pages nie
 * byłby w ogóle uruchamiany. Cała logika serwerowa mieszka więc tutaj:
 *
 *   /robots.txt   — z adresem mapy strony liczonym z hosta żądania
 *   /sitemap.xml  — jw.
 *   /api/lead     — odbiór zapytań z formularza kontaktowego
 *   /             — index.html z adresami bezwzględnymi podmienionymi na
 *                   rzeczywisty adres serwera
 *   /llms.txt     — jw., żeby linki widziane przez asystentów AI wskazywały
 *                   na domenę, pod którą strona faktycznie działa
 *
 * Dzięki liczeniu adresu z żądania to samo wdrożenie działa poprawnie na
 * domenie roboczej i na domenie własnej — bez wpisywania adresu na sztywno
 * i bez zmiany kodu przy przepinaniu domeny.
 *
 * Formularz działa bez żadnej konfiguracji: /api/lead wysyła zapytanie przez
 * FormSubmit na adres z LEAD_EMAIL. Warunek jest jeden i jednorazowy — po
 * pierwszym zapytaniu odbiorca musi kliknąć link aktywacyjny, który przyjdzie
 * na jego skrzynkę.
 *
 * Kanały opcjonalne (Workers → Settings → Variables and Secrets). Worker
 * próbuje ich po kolei i kończy na pierwszym, który przyjmie zapytanie;
 * FormSubmit zostaje wtedy zabezpieczeniem na końcu kolejki:
 *   WEB3FORMS_KEY    — klucz z web3forms.com wystawiony na adres odbiorcy.
 *   LEAD_WEBHOOK_URL — webhook przyjmujący JSON (Make, Zapier, n8n, Slack).
 *   RESEND_API_KEY   — wysyłka przez Resend; wymaga własnej domeny z
 *                      rekordami DKIM/SPF, bo Resend nie wyśle z adresu,
 *                      którego nie zweryfikowano.
 *   LEAD_FROM        — zweryfikowany nadawca w Resend.
 *   LEAD_TO          — odbiorca inny niż LEAD_EMAIL; działa dla wszystkich
 *                      kanałów wysyłających e-mail.
 *
 * Gdyby zawiodły wszystkie kanały, /api/lead zwraca 503, a formularz na
 * stronie przechodzi na wysyłkę przez program pocztowy użytkownika — żadne
 * zapytanie nie znika po cichu.
 *
 * Przed tą logiką stoi bramka `leadGuard`: sprawdza, czy zapytanie wyszło
 * z formularza na tej stronie, i ogranicza liczbę zapytań na adres IP.
 * Sposób wysyłki pozostaje jej całkowicie obojętny.
 */

/**
 * Adres wpisany w index.html. Worker podmienia go na rzeczywisty adres
 * żądania, więc wartość poniżej jest tylko wartością zapasową na wypadek,
 * gdyby plik trafił do przeglądarki z pominięciem Workera.
 */
const BASE_URL = 'https://nieruchomo-ci-chodkiewicza-2.pages.dev'

/**
 * Skrzynka, na którą trafiają zapytania z formularza. Ten sam adres jest
 * podany w stopce i w zapasowej wysyłce przez program pocztowy, więc jego
 * obecność w kodzie niczego nie ujawnia. Zmienna LEAD_TO ma pierwszeństwo.
 */
const LEAD_EMAIL = 'robertsieradz@wp.pl'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  })

const text = (body, type, maxAge) =>
  new Response(body, {
    headers: {
      'Content-Type': type,
      'Cache-Control': `public, max-age=${maxAge}`,
      'X-Content-Type-Options': 'nosniff'
    }
  })

/* ---------- robots.txt ---------- */

function robots (origin) {
  return text([
    'User-agent: *',
    'Allow: /',
    '',
    '# Zasoby robocze i oryginały zdjęć — nieprzeznaczone do indeksowania',
    'Disallow: /admin-panel-starter/',
    'Disallow: /Apartamentnasprzeda%C5%BC/',
    'Disallow: /Lokal%20nr1/',
    'Disallow: /Lokalnr3sprzeedany/',
    'Disallow: /Lokalu%C5%BCytkowynr2wynaj%C4%99ty/',
    '',
    'Sitemap: ' + origin + '/sitemap.xml',
    ''
  ].join('\n'), 'text/plain; charset=utf-8', 3600)
}

/* ---------- sitemap.xml ---------- */

/**
 * Data ostatniej zmiany treści pochodzi z jednego miejsca — znacznika
 * `<time id="updated">` w index.html, który wyświetla się też odwiedzającym
 * jako „Stan ofert”. Dzięki temu aktualizacja oferty wymaga poprawienia daty
 * tylko raz, a mapa strony nie zgłasza zmian, których nie było.
 */
async function contentUpdatedAt (env, url) {
  try {
    const res = await env.ASSETS.fetch(new URL('/', url))
    const found = (await res.text()).match(/<time[^>]+id="updated"[^>]+datetime="(\d{4}-\d{2}-\d{2})"/)
    if (found) return found[1]
  } catch {
    // poniżej wartość zapasowa
  }
  return new Date().toISOString().slice(0, 10)
}

/**
 * Zgłaszamy wyłącznie adres strony głównej. Adresy z kotwicą (`/#lokal`)
 * są dla wyszukiwarek tym samym dokumentem — zgłaszanie ich zaśmieca raport
 * w Search Console wpisami o zduplikowanych stronach i niczego nie wnosi.
 */
function sitemap (origin, lastmod) {
  return text(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    '  <url>\n' +
    '    <loc>' + origin + '/</loc>\n' +
    '    <lastmod>' + lastmod + '</lastmod>\n' +
    '    <changefreq>weekly</changefreq>\n' +
    '    <priority>1.0</priority>\n' +
    '  </url>\n' +
    '</urlset>\n',
    'application/xml; charset=utf-8', 3600
  )
}

/* ---------- ochrona wejścia do /api/lead ---------- */

/*
 * Kanały wysyłki poniżej zostają bez zmian — zmienia się wyłącznie to, kto
 * w ogóle dochodzi do endpointu. Pułapka i próg trzech sekund w `lead()`
 * bronią przed botem wypełniającym formularz w przeglądarce, ale nie przed
 * pętlą z curl-em strzelającą wprost w /api/lead: adres skrzynki jest po
 * stronie Workera, więc taka pętla zasypywała ją bez żadnego ograniczenia.
 */

/** Zapytanie z formularza waży kilkaset bajtów; 16 KiB to zapas z górką. */
const LEAD_MAX_BYTES = 16 * 1024

const tooMany = () =>
  new Response(JSON.stringify({ error: 'rate_limited' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Retry-After': '60'
    }
  })

/**
 * Przeglądarka dokłada nagłówek Origin do każdego żądania POST — także
 * wysyłanego na własny serwer. Skrypt z cudzej strony wpisze tam swój adres
 * i odpadnie tutaj; narzędzie wiersza poleceń domyślnie nie wysyła go wcale.
 * Referer jest zapasem dla nietypowych klientów, które Origin pomijają.
 *
 * Odrzucenie nie kończy się dla człowieka ślepym zaułkiem: formularz na
 * stronie po nieudanej odpowiedzi otwiera program pocztowy z gotową treścią.
 */
function fromThisSite (request, url) {
  const origin = request.headers.get('origin')
  if (origin) return origin === url.origin

  const referer = request.headers.get('referer')
  if (!referer) return false
  try {
    return new URL(referer).host === url.host
  } catch {
    return false
  }
}

/**
 * Licznik zapasowy, trzymany w pamięci instancji Workera. Nie zastąpi
 * licznika Cloudflare — żyje tylko w obrębie jednej instancji i znika po
 * chwili bezczynności — ale działa od razu, bez konfiguracji, i zatrzymuje
 * przypadek najczęstszy: pętlę z jednego adresu.
 */
const recent = new Map()

function burstOk (ip, limit = 5, windowMs = 60000) {
  const now = Date.now()
  // Mapa rośnie z każdym nowym adresem, a pamięci instancji nikt nie sprząta.
  if (recent.size > 2000) recent.clear()

  const hits = (recent.get(ip) || []).filter(t => now - t < windowMs)
  const ok = hits.length < limit
  if (ok) hits.push(now)
  recent.set(ip, hits)
  return ok
}

/**
 * Bramka przed `lead()`. Zwraca odpowiedź, gdy żądanie ma zostać odrzucone,
 * albo `null`, gdy ma przejść dalej.
 *
 * Liczniki Cloudflare (`LEAD_RATELIMIT` — na adres IP, `LEAD_RATELIMIT_ALL`
 * — łącznie) są opcjonalne: bez wpisu w wrangler.jsonc zostaje sam licznik
 * w pamięci, z wpisem ograniczenie obowiązuje w całej sieci brzegowej.
 */
async function leadGuard (request, env, url) {
  if (!fromThisSite(request, url)) return json({ error: 'forbidden' }, 403)

  /*
   * Formularz HTML z cudzej strony potrafi wysłać wyłącznie treść typu
   * urlencoded, multipart albo text/plain. Wymóg JSON-a zamyka więc drogę
   * na skróty przez ukryty formularz na obcym serwerze.
   */
  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    return json({ error: 'unsupported_media_type' }, 415)
  }

  const ip = request.headers.get('cf-connecting-ip') || 'nieznany'
  if (!burstOk(ip)) return tooMany()

  if (env.LEAD_RATELIMIT) {
    const { success } = await env.LEAD_RATELIMIT.limit({ key: ip })
    if (!success) return tooMany()
  }

  /*
   * Osobny licznik bez podziału na adresy: chroni skrzynkę przed zalewem
   * rozłożonym na wiele adresów, którego licznik „na IP” nie zauważy.
   */
  if (env.LEAD_RATELIMIT_ALL) {
    const { success } = await env.LEAD_RATELIMIT_ALL.limit({ key: 'lead' })
    if (!success) return tooMany()
  }

  return null
}

/**
 * Treść żądania czytana z twardym limitem. Nagłówek `content-length` nie
 * wystarcza — nadawca może go pominąć i wysłać treść porcjami, a wtedy
 * deklarowany rozmiar nie istnieje i sprawdzać nie ma czego. Dlatego bajty
 * liczone są w trakcie odbierania, a strumień urywa się w chwili
 * przekroczenia progu, zamiast po odebraniu całości.
 */
async function readCapped (request, max) {
  if (!request.body) return null

  const reader = request.body.getReader()
  const chunks = []
  let size = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }

  const joined = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    joined.set(chunk, at)
    at += chunk.byteLength
  }
  return new TextDecoder().decode(joined)
}

/* ---------- formularz kontaktowy ---------- */

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

async function lead (request, env, raw) {
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  /*
   * Pole-pułapka: ukryte przed człowiekiem, wypełniane przez boty
   * uzupełniające wszystkie pola formularza. Odpowiadamy sukcesem, żeby
   * nadawca nie dowiedział się, że wiadomość poszła do kosza.
   */
  if (clean(payload.company, 200)) return json({ ok: true })

  /*
   * Formularz stempluje moment wyświetlenia strony. Człowiek potrzebuje
   * kilku sekund na wypełnienie pól; bot wysyła natychmiast.
   */
  const elapsed = Number(payload.elapsed)
  if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 3000) return json({ ok: true })

  const item = {
    name: clean(payload.name, 120),
    phone: clean(payload.phone, 40),
    email: clean(payload.email, 160),
    topic: clean(payload.topic, 120) || 'Inne pytanie',
    message: clean(payload.message, 4000),
    receivedAt: new Date().toISOString(),
    source: request.headers.get('referer') || 'chodkiewicza2'
  }

  if (!item.name || !item.email || !item.message) return json({ error: 'missing_fields' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(item.email)) return json({ error: 'invalid_email' }, 400)

  const lines = [
    'Nowe zapytanie ze strony Chodkiewicza 2',
    '',
    'Imię i nazwisko: ' + item.name,
    'Telefon: ' + (item.phone || '—'),
    'E-mail: ' + item.email,
    'Dotyczy: ' + item.topic,
    '',
    item.message
  ].join('\n')

  const recipient = clean(env.LEAD_TO, 160) || LEAD_EMAIL

  /*
   * Web3Forms: pośrednik, który wysyła wiadomość na adres potwierdzony przy
   * zakładaniu klucza. Nadawcą jest jego serwer, więc nie potrzeba własnej
   * domeny ani rekordów DNS — jedyna droga, żeby zapytania trafiały wprost
   * na skrzynkę wp.pl. Adres z formularza ląduje w polu „Odpowiedz do”.
   */
  if (env.WEB3FORMS_KEY) {
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: env.WEB3FORMS_KEY,
          subject: 'Zapytanie ze strony — ' + item.topic,
          from_name: 'Chodkiewicza 2',
          name: item.name,
          email: item.email,
          phone: item.phone || '—',
          message: lines
        })
      })
      /*
       * Web3Forms potrafi odpowiedzieć kodem 200 z `success: false`
       * (np. przy zużytym limicie), więc sam status HTTP nie wystarcza.
       */
      if (res.ok) {
        const body = await res.json().catch(() => null)
        if (!body || body.success !== false) return json({ ok: true })
      }
    } catch {
      // spróbuj kolejnego kanału
    }
  }

  if (env.LEAD_WEBHOOK_URL) {
    try {
      const res = await fetch(env.LEAD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item, text: lines, content: lines })
      })
      if (res.ok) return json({ ok: true })
    } catch {
      // spróbuj kolejnego kanału
    }
  }

  if (env.RESEND_API_KEY && env.LEAD_FROM) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + env.RESEND_API_KEY
        },
        body: JSON.stringify({
          from: env.LEAD_FROM,
          to: [recipient],
          reply_to: item.email,
          subject: 'Zapytanie ze strony — ' + item.topic,
          text: lines
        })
      })
      if (res.ok) return json({ ok: true })
    } catch {
      // brak kanału wysyłki
    }
  }

  /*
   * FormSubmit: działa bez konta i bez klucza — wystarczy, że po pierwszym
   * zapytaniu odbiorca kliknie link aktywacyjny, który przyjdzie na jego
   * skrzynkę. Dlatego stoi na końcu jako kanał domyślny: gdy nic nie jest
   * skonfigurowane, formularz i tak dostarcza wiadomość, zamiast zwracać błąd.
   */
  try {
    const res = await fetch('https://formsubmit.co/ajax/' + encodeURIComponent(recipient), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        _subject: 'Zapytanie ze strony — ' + item.topic,
        _template: 'table',
        _captcha: 'false',
        name: item.name,
        email: item.email,
        phone: item.phone || '—',
        message: lines
      })
    })
    /* Pole `success` przychodzi jako napis, nie jako wartość logiczna. */
    if (res.ok) {
      const body = await res.json().catch(() => null)
      if (!body || String(body.success) === 'true') return json({ ok: true })
    }
  } catch {
    // wszystkie kanały zawiodły
  }

  return json({ error: 'not_configured' }, 503)
}

/* ---------- adresy sekcji ---------- */

/**
 * Strona jest jednym dokumentem — każda sekcja to kotwica, nie osobny adres.
 * Adres wpisany ręcznie, podany w rozmowie telefonicznej albo wydrukowany na
 * ulotce („chodkiewicza2.pl/kontakt”) trafiał więc na stronę błędu. Poniższa
 * mapa przekłada takie ścieżki na `id` istniejące w index.html.
 *
 * Klucze są w postaci znormalizowanej przez `slug()` — bez polskich znaków
 * i bez ukośników. Warianty (`oferta` / `oferty` / `nieruchomosci`) są
 * wypisane celowo: każdy z nich ktoś może wpisać z pamięci.
 */
const ANCHORS = {
  'o-nas': 'o-nas',
  'onas': 'o-nas',
  'o-inwestycji': 'o-nas',
  'o-budynku': 'o-nas',
  'budynek': 'o-nas',
  'lokale': 'lokale',
  'oferta': 'lokale',
  'oferty': 'lokale',
  'nieruchomosci': 'lokale',
  'apartament': 'apartament',
  'apartament-nr-4': 'apartament',
  'mieszkanie': 'apartament',
  'sprzedaz': 'apartament',
  'na-sprzedaz': 'apartament',
  'galeria': 'apartament-galeria',
  'lokal': 'lokal',
  'lokal-nr-1': 'lokal',
  'lokal-uzytkowy': 'lokal',
  'wynajem': 'lokal',
  'do-wynajecia': 'lokal',
  'wsparcie-najemcy': 'wsparcie-najemcy',
  'dla-najemcy': 'wsparcie-najemcy',
  'faq': 'faq',
  'pytania': 'faq',
  'pytania-i-odpowiedzi': 'faq',
  'kontakt': 'kontakt',
  'kontakty': 'kontakt',
  'napisz': 'kontakt',
  'umow-prezentacje': 'kontakt',
  'prywatnosc': 'prywatnosc',
  'polityka-prywatnosci': 'prywatnosc',
  'rodo': 'prywatnosc'
}

const DIACRITICS = { 'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z' }

/**
 * Ścieżka → klucz mapy. Odporne na wielkość liter, końcowy ukośnik, polskie
 * znaki (także zapisane procentowo, stąd dekodowanie) i znaki podkreślenia.
 */
function slug (pathname) {
  let raw = pathname
  try {
    raw = decodeURIComponent(pathname)
  } catch {
    // ciąg z niepoprawnym kodowaniem procentowym — pracujemy na oryginale
  }
  return raw
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, ch => DIACRITICS[ch])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Ścieżka pliku (`/assets/img/x.webp`, `/site.webmanifest`) czy adres strony
 * (`/kontakt`)? Brakujący plik ma dostać uczciwe 404; brakujący adres strony
 * — przejść na stronę główną.
 */
const looksLikeFile = pathname => /\.[a-z0-9]{2,5}$/i.test(pathname)

/* ---------- strona główna ---------- */

/**
 * Adres kanoniczny, Open Graph i dane strukturalne muszą być bezwzględne —
 * scrapery serwisów społecznościowych nie rozwijają ścieżek względnych.
 * To samo dotyczy linków w llms.txt, które czytają asystenci AI. W plikach
 * zapisany jest BASE_URL, tutaj podmieniamy go na adres, pod którym strona
 * faktycznie została pobrana.
 */
async function page (request, env, origin) {
  const res = await env.ASSETS.fetch(request)
  if (origin === BASE_URL) return res

  const type = res.headers.get('content-type') || ''
  if (!type.includes('text/html') && !type.includes('text/plain')) return res

  try {
    const body = (await res.text()).replaceAll(BASE_URL, origin)
    const headers = new Headers(res.headers)
    headers.delete('content-length')
    headers.delete('etag')
    return new Response(body, { status: res.status, headers })
  } catch {
    // gdyby cokolwiek poszło nie tak, lepiej oddać stronę bez podmiany
    // niż nie oddać jej wcale
    return env.ASSETS.fetch(request)
  }
}

/* ---------- router ---------- */

export default {
  async fetch (request, env) {
    const url = new URL(request.url)
    const origin = url.origin

    // /index.html i / to ten sam dokument pod dwoma adresami — jeden z nich
    // musi być jedynym, żeby nie rozpraszać sygnałów rankingowych.
    if (url.pathname === '/index.html') {
      return Response.redirect(origin + '/' + url.search, 301)
    }

    if (url.pathname === '/robots.txt') return robots(origin)
    if (url.pathname === '/sitemap.xml') return sitemap(origin, await contentUpdatedAt(env, url))

    if (url.pathname === '/api/lead') {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
      const blocked = await leadGuard(request, env, url)
      if (blocked) return blocked

      const raw = await readCapped(request, LEAD_MAX_BYTES)
      if (raw === null) return json({ error: 'payload_too_large' }, 413)

      return lead(request, env, raw)
    }

    // Znany adres sekcji — przekierowanie trwałe, bo docelowa kotwica się
    // nie zmieni. Parametry (np. kampanijne utm_*) przenosimy dalej.
    const anchor = ANCHORS[slug(url.pathname)]
    if (anchor) return Response.redirect(origin + '/' + url.search + '#' + anchor, 301)

    const res = await page(request, env, origin)

    /*
     * Cokolwiek innego, co wygląda na adres strony, a nie na plik — na stronę
     * główną, zamiast na komunikat o błędzie. Kod 302, nie 301: te adresy nie
     * mają stałego odpowiednika, a trwałe przekierowanie kazałoby
     * wyszukiwarkom zapamiętać przypadkowy adres jako wersję strony głównej.
     * Brakujący plik nadal dostaje 404 — inaczej przeglądarka dostałaby
     * dokument HTML w miejscu obrazka albo arkusza stylów.
     */
    if (res.status === 404 && request.method === 'GET' && !looksLikeFile(url.pathname)) {
      return Response.redirect(origin + '/', 302)
    }

    return res
  }
}
