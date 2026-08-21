import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { extname, join } from 'path'

const root = process.cwd()
const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.webp':'image/webp',
  '.jpg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.webmanifest':'application/manifest+json' }

const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p === '/') p = '/index.html'
  try {
    const buf = await readFile(join(root, p))
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' })
    res.end(buf)
  } catch { res.writeHead(404); res.end('nope') }
})
await new Promise(r => srv.listen(0, r))
const base = `http://localhost:${srv.address().port}`

const browser = await chromium.launch()
let fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'OK  ' : 'BLAD'}  ${name}: ${JSON.stringify(got)} (oczekiwano ${JSON.stringify(want)})`)
}

const googleHits = page => {
  const hits = []
  page.on('request', r => { if (/google/i.test(r.url()) && !/maps|\/maps\//.test(r.url())) hits.push(r.url()) })
  return hits
}

// 1. pierwsza wizyta - zero zada\u0144 do Google, baner widoczny
{
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  const hits = googleHits(page)
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  check('pierwsza wizyta: zapytania do Google', hits.filter(u => /googletagmanager|google-analytics/.test(u)).length, 0)
  check('baner widoczny', await page.isVisible('#consent'), true)
  check('cookie _ga przed zgoda', (await ctx.cookies()).filter(c => c.name.startsWith('_ga')).length, 0)
  await ctx.close()
}

// 2. odrzucenie - nadal nic, baner znika, wyb\u00f3r zapami\u0119tany
{
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  const hits = googleHits(page)
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.click('#consentNo')
  await page.waitForTimeout(900)
  check('po odrzuceniu: zapytania do Google', hits.filter(u => /googletagmanager|google-analytics/.test(u)).length, 0)
  check('baner ukryty po odrzuceniu', await page.isVisible('#consent'), false)
  check('wybor zapisany', await page.evaluate(() => localStorage.getItem('ch2-zgoda-analityka')), 'denied')
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  check('po odswiezeniu baner sie nie wraca', await page.isVisible('#consent'), false)
  check('po odswiezeniu nadal brak Google', hits.filter(u => /googletagmanager|google-analytics/.test(u)).length, 0)
  await ctx.close()
}

// 3. akceptacja - gtag.js si\u0119 doczytuje
{
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  const hits = googleHits(page)
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.click('#consentYes')
  await page.waitForTimeout(1500)
  check('po zgodzie: gtag.js pobrany', hits.some(u => u.includes('googletagmanager.com/gtag/js')), true)
  check('baner ukryty po zgodzie', await page.isVisible('#consent'), false)
  check('wybor zapisany', await page.evaluate(() => localStorage.getItem('ch2-zgoda-analityka')), 'granted')
  await ctx.close()
}

// 4. ponowne otwarcie ustawie\u0144 ze stopki
{
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.click('#consentNo')
  await page.waitForTimeout(700)
  await page.evaluate(() => document.querySelector('footer [data-consent-settings]').click())
  await page.waitForTimeout(500)
  check('baner wraca z linku w stopce', await page.isVisible('#consent'), true)
  await ctx.close()
}

// 5. 404 bez zgody
{
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  const hits = googleHits(page)
  await page.goto(base + '/404.html', { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  check('404 bez zgody: zapytania do Google', hits.filter(u => /googletagmanager|google-analytics/.test(u)).length, 0)
  await ctx.close()
}

// 6. brak poziomego przewijania na mobile z banerem
{
  const ctx = await browser.newContext({ viewport: { width: 320, height: 640 } })
  const page = await ctx.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  check('320px: brak poziomego przewijania', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true)
  check('320px: oba przyciski klikalne', await page.evaluate(() => {
    const r = document.querySelector('#consentNo').getBoundingClientRect()
    return r.width > 40 && r.bottom <= window.innerHeight
  }), true)
  await ctx.close()
}

await browser.close()
srv.close()
console.log(fail ? `\n${fail} BLEDOW` : '\nwszystko przeszlo')
process.exit(fail ? 1 : 0)
