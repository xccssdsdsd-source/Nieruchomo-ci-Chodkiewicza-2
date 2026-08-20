import worker from './worker.js'

/* Stub warstwy statycznej i sieci — nic nie wychodzi na zewnątrz. */
let outbound = []
const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  outbound.push(String(url))
  return new Response(JSON.stringify({ success: 'true' }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}
const env = { ASSETS: { fetch: async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }) } }

const body = {
  name: 'Jan Testowy', email: 'jan@example.com', phone: '500100200',
  topic: 'Apartament', message: 'Test bramki.', company: '', elapsed: 20000
}

const post = (headers, ip = '1.2.3.4') => new Request('https://chodkiewicza2.pl/api/lead', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...headers },
  body: JSON.stringify(body)
})

const call = async req => {
  const res = await worker.fetch(req, env)
  return [res.status, await res.json().catch(() => ({}))]
}

const cases = []
const check = (label, got, want) => cases.push([label, got === want, `${got} (oczekiwano ${want})`])

// 1. Żądanie ze strony — musi przejść do kanału wysyłki
outbound = []
let [s] = await call(post({ Origin: 'https://chodkiewicza2.pl' }, '10.0.0.1'))
check('POST z własnej strony', s, 200)
check('trafił do FormSubmit', outbound.some(u => u.includes('formsubmit.co')), true)

// 2. Obcy Origin
;[s] = await call(post({ Origin: 'https://zlyserwis.example' }, '10.0.0.2'))
check('POST z obcej strony', s, 403)

// 3. Brak Origin i Referera (curl)
;[s] = await call(post({}, '10.0.0.3'))
check('POST bez Origin/Referer (curl)', s, 403)

// 4. Referer jako zapas
;[s] = await call(post({ Referer: 'https://chodkiewicza2.pl/#kontakt' }, '10.0.0.4'))
check('POST z samym Refererem', s, 200)

// 5. Zły typ treści (formularz z obcego serwera)
{
  const req = new Request('https://chodkiewicza2.pl/api/lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://chodkiewicza2.pl', 'CF-Connecting-IP': '10.0.0.5' },
    body: 'name=x&email=x@x.pl&message=x'
  })
  const res = await worker.fetch(req, env)
  check('POST jako zwykły formularz', res.status, 415)
}

// 6. Zbyt duża treść
{
  const req = new Request('https://chodkiewicza2.pl/api/lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://chodkiewicza2.pl', 'CF-Connecting-IP': '10.0.0.6' },
    body: JSON.stringify({ ...body, message: 'x'.repeat(20000) })
  })
  const res = await worker.fetch(req, env)
  check('POST 20 KB treści', res.status, 413)
}

// 7. Pętla z jednego adresu — 5 przechodzi, szóste odpada
const codes = []
for (let i = 0; i < 7; i++) {
  const [code] = await call(post({ Origin: 'https://chodkiewicza2.pl' }, '9.9.9.9'))
  codes.push(code)
}
check('pętla z jednego IP: 7 prób', codes.join(','), '200,200,200,200,200,429,429')

// 8. Inny adres nie jest ukarany za cudzą pętlę
;[s] = await call(post({ Origin: 'https://chodkiewicza2.pl' }, '8.8.8.8'))
check('inny gość po cudzej pętli', s, 200)

// 9. Licznik Cloudflare (gdy binding jest skonfigurowany)
{
  const stop = { limit: async () => ({ success: false }) }
  const pass = { limit: async () => ({ success: true }) }

  const res1 = await worker.fetch(post({ Origin: 'https://chodkiewicza2.pl' }, '7.7.7.1'), { ...env, LEAD_RATELIMIT: stop })
  check('licznik Cloudflare na IP odrzuca', res1.status, 429)

  const res2 = await worker.fetch(post({ Origin: 'https://chodkiewicza2.pl' }, '7.7.7.2'), { ...env, LEAD_RATELIMIT: pass, LEAD_RATELIMIT_ALL: stop })
  check('licznik łączny odrzuca', res2.status, 429)

  const res3 = await worker.fetch(post({ Origin: 'https://chodkiewicza2.pl' }, '7.7.7.3'), { ...env, LEAD_RATELIMIT: pass, LEAD_RATELIMIT_ALL: pass })
  check('oba liczniki przepuszczają', res3.status, 200)
}

// 10. GET dalej odrzucany
{
  const res = await worker.fetch(new Request('https://chodkiewicza2.pl/api/lead'), env)
  check('GET /api/lead', res.status, 405)
}

globalThis.fetch = realFetch
let bad = 0
for (const [label, ok, detail] of cases) {
  if (!ok) bad++
  console.log(`${ok ? 'OK  ' : 'BŁĄD'}  ${label}: ${detail}`)
}
console.log(bad ? `\n${bad} niepowodzeń` : '\nwszystko przeszło')
process.exit(bad ? 1 : 0)
