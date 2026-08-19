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
 *
 * Dzięki liczeniu adresu z żądania to samo wdrożenie działa poprawnie na
 * domenie roboczej i na domenie własnej — bez wpisywania adresu na sztywno
 * i bez zmiany kodu przy przepinaniu domeny.
 *
 * Konfiguracja formularza (Workers → Settings → Variables and Secrets):
 *   LEAD_WEBHOOK_URL — webhook przyjmujący JSON (Make, Zapier, n8n, Slack).
 *   RESEND_API_KEY   — alternatywnie wysyłka e-mailem przez Resend.
 *   LEAD_TO          — odbiorca dla Resend (domyślnie robertsieradz@wp.pl).
 *   LEAD_FROM        — zweryfikowany nadawca w Resend.
 *
 * Gdy nic nie jest ustawione, /api/lead zwraca 503, a formularz na stronie
 * przechodzi na wysyłkę przez program pocztowy użytkownika — żadne zapytanie
 * nie znika po cichu.
 */

/**
 * Adres wpisany w index.html. Worker podmienia go na rzeczywisty adres
 * żądania, więc wartość poniżej jest tylko wartością zapasową na wypadek,
 * gdyby plik trafił do przeglądarki z pominięciem Workera.
 */
const BASE_URL = 'https://nieruchomo-ci-chodkiewicza-2.pages.dev'

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

/* ---------- formularz kontaktowy ---------- */

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

async function lead (request, env) {
  let payload
  try {
    payload = await request.json()
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
          to: [env.LEAD_TO || 'robertsieradz@wp.pl'],
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

  return json({ error: 'not_configured' }, 503)
}

/* ---------- strona główna ---------- */

/**
 * Adres kanoniczny, Open Graph i dane strukturalne muszą być bezwzględne —
 * scrapery serwisów społecznościowych nie rozwijają ścieżek względnych.
 * W pliku zapisany jest BASE_URL, tutaj podmieniamy go na adres, pod którym
 * strona faktycznie została pobrana.
 */
async function page (request, env, origin) {
  const res = await env.ASSETS.fetch(request)
  if (origin === BASE_URL) return res

  const type = res.headers.get('content-type') || ''
  if (!type.includes('text/html')) return res

  try {
    const html = (await res.text()).replaceAll(BASE_URL, origin)
    const headers = new Headers(res.headers)
    headers.delete('content-length')
    headers.delete('etag')
    return new Response(html, { status: res.status, headers })
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

    if (url.pathname === '/robots.txt') return robots(origin)
    if (url.pathname === '/sitemap.xml') return sitemap(origin, await contentUpdatedAt(env, url))

    if (url.pathname === '/api/lead') {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
      return lead(request, env)
    }

    return page(request, env, origin)
  }
}
