/**
 * Odbiór zapytań z formularza kontaktowego — Cloudflare Pages Function.
 *
 * Konfiguracja (Settings → Environment variables):
 *   LEAD_WEBHOOK_URL — dowolny webhook przyjmujący JSON (Make, Zapier, n8n,
 *                      Slack/Discord). Otrzymuje pełną treść zapytania.
 *   RESEND_API_KEY   — alternatywnie wysyłka e-mailem przez Resend.
 *   LEAD_TO          — adres odbiorcy dla Resend (domyślnie robertsieradz@wp.pl).
 *   LEAD_FROM        — zweryfikowany nadawca w Resend, np. strona@twojadomena.pl.
 *
 * Gdy nic nie jest skonfigurowane, endpoint zwraca 503. Formularz na stronie
 * przechodzi wtedy automatycznie na wysyłkę przez program pocztowy użytkownika,
 * więc żadne zapytanie nie znika po cichu.
 */

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  })

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export async function onRequestPost ({ request, env }) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const lead = {
    name: clean(payload.name, 120),
    phone: clean(payload.phone, 40),
    email: clean(payload.email, 160),
    topic: clean(payload.topic, 120) || 'Inne pytanie',
    message: clean(payload.message, 4000),
    receivedAt: new Date().toISOString(),
    source: request.headers.get('referer') || 'chodkiewicza2'
  }

  if (!lead.name || !lead.email || !lead.message) return json({ error: 'missing_fields' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email)) return json({ error: 'invalid_email' }, 400)

  const lines = [
    'Nowe zapytanie ze strony Chodkiewicza 2',
    '',
    'Imię i nazwisko: ' + lead.name,
    'Telefon: ' + (lead.phone || '—'),
    'E-mail: ' + lead.email,
    'Dotyczy: ' + lead.topic,
    '',
    lead.message
  ].join('\n')

  if (env.LEAD_WEBHOOK_URL) {
    try {
      const res = await fetch(env.LEAD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...lead, text: lines, content: lines })
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
          reply_to: lead.email,
          subject: 'Zapytanie ze strony — ' + lead.topic,
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
