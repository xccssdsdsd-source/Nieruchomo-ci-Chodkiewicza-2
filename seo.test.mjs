import { existsSync, readFileSync } from 'fs'
import { dirname, extname, join, posix } from 'path'
import worker from './worker.js'

const root = process.cwd()
const BASE_URL = 'https://nieruchomo-ci-chodkiewicza-2.pages.dev'
const SITE = 'https://chodkiewicza2.pl'

const APARTMENT = '/apartament-na-sprzedaz-sieradz'
const UNIT = '/lokal-uzytkowy-do-wynajecia-sieradz'
const LOCATION = '/osiedle-hetmanskie-sieradz'
const SUBPAGES = [APARTMENT, UNIT, LOCATION]

/* Stub warstwy statycznej: czyta prawdziwe pliki z dysku, tak jak ASSETS. */
const TYPES = { '.html': 'text/html', '.txt': 'text/plain; charset=utf-8' }

const fileFor = pathname => {
  if (pathname === '/') return 'index.html'
  const name = pathname.slice(1)
  return extname(name) ? name : name + '.html'
}

const env = {
  ASSETS: {
    fetch: async input => {
      const { pathname } = new URL(input.url || input)
      const file = join(root, decodeURIComponent(fileFor(pathname)))
      if (!existsSync(file)) return new Response('brak', { status: 404, headers: { 'content-type': 'text/plain' } })
      return new Response(readFileSync(file), {
        headers: { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }
      })
    }
  }
}

/* Sieć odcięta — zapytanie z formularza nie może nigdzie wyjść. */
const realFetch = globalThis.fetch
globalThis.fetch = async () => new Response(JSON.stringify({ success: 'true' }), {
  status: 200, headers: { 'Content-Type': 'application/json' }
})

const cases = []
const check = (label, got, want) => cases.push([label, got === want, `${got} (oczekiwano ${want})`])
const hit = (url, init) => worker.fetch(new Request(url, init), env)
const location = res => res.headers.get('location')

/* ---------- pomocnicze: odczyt HTML bez parsera ---------- */

const read = file => (existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : null)

const attr = (tag, name) => {
  const found = tag.match(new RegExp('\\s' + name + '="([^"]*)"'))
  return found ? found[1] : null
}

const tags = (html, name) => html.match(new RegExp('<' + name + '\\b[^>]*>', 'g')) || []

const metaBy = (html, key, value) =>
  tags(html, 'meta').find(tag => attr(tag, key) === value)

const decode = v => v
  .replace(/&nbsp;/g, ' ')
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')

const squeeze = v => v.replace(/[\s  ]+/g, ' ').trim()

/** To, co widać na stronie: bez skryptów, stylów i znaczników. */
const visible = html => squeeze(decode(html
  .replace(/<script\b[\s\S]*?<\/script>/g, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/g, ' ')
  .replace(/<head\b[\s\S]*?<\/head>/g, ' ')
  .replace(/<[^>]+>/g, '')))

const jsonLd = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1])

const graphOf = html => jsonLd(html).flatMap(raw => {
  const data = JSON.parse(raw)
  return data['@graph'] || [data]
})

const typed = (graph, type) => graph.filter(node => [].concat(node['@type']).includes(type))

const deepFind = (value, key) => {
  if (!value || typeof value !== 'object') return undefined
  if (key in value) return value[key]
  for (const child of Object.values(value)) {
    const found = deepFind(child, key)
    if (found !== undefined) return found
  }
  return undefined
}

/** Blok pytań: od elementu z klasą `faq` do końca jego sekcji. */
function faqBlockCount (html) {
  const start = html.search(/class="(?:[^"]*\s)?faq(?:\s[^"]*)?"/)
  if (start < 0) return 0
  const rest = html.slice(start)
  const end = rest.search(/<\/section>|<\/main>/)
  const block = end < 0 ? rest : rest.slice(0, end)
  return (block.match(/<details\b/g) || block.match(/<h3\b/g) || []).length
}

/** Pliki z katalogu assets, do których prowadzi dokument. */
function assetRefs (html) {
  const refs = []
  for (const name of ['img', 'source', 'link', 'script', 'meta']) {
    for (const tag of tags(html, name)) {
      for (const key of ['src', 'href', 'content']) {
        const value = attr(tag, key)
        if (value) refs.push(value)
      }
      for (const key of ['srcset', 'imagesrcset']) {
        const value = attr(tag, key)
        if (value) refs.push(...value.split(',').map(part => part.trim().split(/\s+/)[0]))
      }
    }
  }
  for (const tag of tags(html, 'a')) {
    const value = attr(tag, 'href')
    if (value) refs.push(value)
  }
  return [...new Set(refs
    .map(ref => ref.replace(BASE_URL, ''))
    .filter(ref => /^\/?assets\//.test(ref))
    .map(ref => ref.replace(/^\//, '').split(/[?#]/)[0]))]
}

/** Czcionki i obrazy, do których prowadzi arkusz stylów. */
function cssRefs (file) {
  const css = read(file)
  if (css === null) return []
  return [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)]
    .map(m => m[1])
    .filter(ref => !ref.startsWith('data:') && !/^https?:/.test(ref))
    .map(ref => (ref.startsWith('/')
      ? ref.slice(1)
      : posix.normalize(posix.join(dirname(file).replace(/\\/g, '/'), ref))).split(/[?#]/)[0])
}

const hasId = (html, id) => new RegExp('\\sid="' + id + '"').test(html)

/** Odnośnik wewnętrzny: strona istnieje, a kotwica, jeśli jest, też. */
function linkProblem (href, html, homepage) {
  if (/^(tel:|mailto:)/.test(href)) return null
  const local = href.replace(BASE_URL, '')
  if (/^https?:/.test(local)) return null

  if (local.startsWith('#')) {
    const id = local.slice(1)
    return !id || hasId(html, id) ? null : 'brak kotwicy ' + local
  }

  const [path, fragment] = local.split('#')
  const clean = path.split('?')[0]
  if (/^\/?assets\//.test(clean)) return null
  if (clean === '/') {
    return !fragment || hasId(homepage, fragment) ? null : 'brak kotwicy na stronie głównej: ' + local
  }

  const target = read(fileFor(clean))
  if (target === null) return 'brak strony ' + clean
  return !fragment || hasId(target, fragment) ? null : 'brak kotwicy ' + local
}

const money = n => String(n).replace(/\B(?=(\d{3})+$)/g, ' ')

/* ---------- A. Worker ---------- */

// Jeden adres kanoniczny
{
  const res = await hit('https://www.chodkiewicza2.pl/x?a=1')
  check('www: status', res.status, 301)
  check('www: cel z zachowaną ścieżką', location(res), SITE + '/x?a=1')
}

{
  const res = await hit('http://chodkiewicza2.pl/')
  check('http: status', res.status, 301)
  check('http: cel', location(res), SITE + '/')
}

{
  const res = await hit('https://www.chodkiewicza2.pl/api/lead', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://www.chodkiewicza2.pl',
      'CF-Connecting-IP': '10.9.9.1'
    },
    body: JSON.stringify({
      name: 'Jan Testowy', email: 'jan@example.com', phone: '500100200',
      topic: 'Apartament', message: 'Test.', company: '', elapsed: 20000
    })
  })
  check('POST na www nie jest przekierowany', res.status, 200)
  check('POST na www bez nagłówka Location', location(res), null)
}

{
  const res = await hit('http://localhost:8787/')
  const html = await res.text()
  check('localhost: bez przekierowania', res.status, 200)
  check('localhost: adres kanoniczny lokalny', html.includes('<link rel="canonical" href="http://localhost:8787/">'), true)
}

{
  const res = await hit('https://nieruchomo-ci-chodkiewicza-2.konto.workers.dev/')
  const html = await res.text()
  check('workers.dev: bez przekierowania', res.status, 200)
  check('workers.dev: kanoniczny na domenę właściwą', html.includes('<link rel="canonical" href="' + SITE + '/">'), true)
  check('workers.dev: bez adresu roboczego w treści', html.includes('workers.dev'), false)
}

// Skróty do podstron
for (const [from, to] of [
  ['/apartament?utm_source=ulotka', APARTMENT + '?utm_source=ulotka'],
  ['/wynajem?utm_source=ulotka', UNIT + '?utm_source=ulotka'],
  ['/lokalizacja?utm_source=ulotka', LOCATION + '?utm_source=ulotka'],
  ['/Mieszkanie/?utm_source=ulotka', APARTMENT + '?utm_source=ulotka']
]) {
  const res = await hit(SITE + from)
  check('skrót ' + from + ': status', res.status, 301)
  check('skrót ' + from + ': cel', location(res), SITE + to)
}

{
  const res = await hit(SITE + '/kontakt')
  check('/kontakt: status', res.status, 301)
  check('/kontakt: nadal kotwica strony głównej', location(res), SITE + '/#kontakt')
}

// robots.txt
{
  const res = await hit(SITE + '/robots.txt')
  const body = await res.text()
  check('robots.txt: status', res.status, 200)
  check('robots.txt: Content-Signal', /^Content-Signal: .*ai-input=yes/m.test(body), true)
  check('robots.txt: mapa strony', body.includes('Sitemap: ' + SITE + '/sitemap.xml'), true)
}

// sitemap.xml
{
  const res = await hit(SITE + '/sitemap.xml')
  const body = await res.text()
  const entries = [...body.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => m[1])
  const locs = entries.map(entry => entry.match(/<loc>([^<]+)<\/loc>/)[1])

  check('sitemap: status', res.status, 200)
  check('sitemap: liczba adresów', entries.length, 4)
  check('sitemap: bez niezakodowanego &', /&(?!(amp|lt|gt|quot|apos);)/.test(body), false)
  check('sitemap: domknięte znaczniki', (body.match(/<url>/g) || []).length, (body.match(/<\/url>/g) || []).length)

  for (const path of ['/', ...SUBPAGES]) {
    const index = locs.indexOf(SITE + path)
    check('sitemap: adres ' + path, index >= 0, true)
    if (index < 0) continue

    const html = read(fileFor(path))
    const stamp = html && html.match(/<time[^>]+id="updated"[^>]+datetime="(\d{4}-\d{2}-\d{2})"/)
    const lastmod = entries[index].match(/<lastmod>([^<]+)<\/lastmod>/)[1]
    check('sitemap: lastmod ' + path, lastmod, stamp ? stamp[1] : 'brak znacznika time')
  }

  const images = [...body.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map(m => m[1].replace(SITE + '/', ''))
  const missing = images.filter(file => !existsSync(join(root, file)))
  check('sitemap: są zdjęcia', images.length > 0, true)
  check('sitemap: zdjęcia istnieją na dysku', missing.join(', '), '')
}

/* ---------- B. Podstrony ---------- */

const homepage = read('index.html')

for (const path of SUBPAGES) {
  const label = path.slice(1)
  const html = read(fileFor(path))
  check(label + ': plik istnieje', html !== null, true)
  if (html === null) continue

  const canonicalUrl = BASE_URL + path

  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || ''
  check(label + ': title ma treść', title.length > 0, true)
  check(label + ': title do 60 znaków (' + decode(title).length + ')', decode(title).length <= 60, true)

  const description = attr(metaBy(html, 'name', 'description') || '', 'content') || ''
  const length = decode(description).length
  check(label + ': description 120–160 znaków (' + length + ')', length >= 120 && length <= 160, true)

  check(label + ': jeden <h1>', tags(html, 'h1').length, 1)

  const canonical = tags(html, 'link').find(tag => attr(tag, 'rel') === 'canonical')
  check(label + ': canonical', canonical ? attr(canonical, 'href') : null, canonicalUrl)
  check(label + ': og:url', attr(metaBy(html, 'property', 'og:url') || '', 'content'), canonicalUrl)

  const stamps = html.match(/<time[^>]+id="updated"[^>]+datetime="\d{4}-\d{2}-\d{2}"/g) || []
  check(label + ': jeden znacznik daty', stamps.length, 1)

  let graph = []
  try {
    graph = graphOf(html)
    check(label + ': JSON-LD się parsuje', jsonLd(html).length > 0, true)
  } catch (error) {
    check(label + ': JSON-LD się parsuje', error.message, 'bez błędu')
  }

  const text = visible(html)

  const [faq] = typed(graph, 'FAQPage')
  check(label + ': FAQPage w danych', Boolean(faq), true)
  if (faq) {
    const questions = faq.mainEntity
    check(label + ': liczba pytań = bloki w .faq', questions.length, faqBlockCount(html))
    for (const question of questions) {
      check(label + ': pytanie widoczne: ' + question.name, text.includes(squeeze(question.name)), true)
      check(label + ': odpowiedź widoczna: ' + question.name, text.includes(squeeze(question.acceptedAnswer.text)), true)
    }
  }

  const [breadcrumb] = typed(graph, 'BreadcrumbList')
  check(label + ': BreadcrumbList w danych', Boolean(breadcrumb), true)
  if (breadcrumb) {
    const last = breadcrumb.itemListElement.at(-1)
    const item = last.item && last.item['@id'] ? last.item['@id'] : last.item
    check(label + ': okruszki kończą się bieżącą stroną', item, canonicalUrl)
  }

  const badImages = tags(html, 'img').filter(tag =>
    !attr(tag, 'alt') || !attr(tag, 'width') || !attr(tag, 'height'))
  check(label + ': <img> ma alt, width i height', badImages.join(' '), '')

  const assets = assetRefs(html)
  const fromCss = assets.filter(file => file.endsWith('.css')).flatMap(cssRefs)
  const missing = [...assets, ...fromCss].filter(file => !existsSync(join(root, file)))
  check(label + ': pliki z assets istnieją', [...new Set(missing)].join(', '), '')

  const problems = tags(html, 'a')
    .map(tag => attr(tag, 'href'))
    .filter(Boolean)
    .map(href => linkProblem(href, html, homepage))
    .filter(Boolean)
  check(label + ': odnośniki wewnętrzne', [...new Set(problems)].join('; '), '')

  check(label + ': bez niepodmienionych wzorców', html.includes('{{'), false)
  check(label + ': bez węzła „Zachód”', html.includes('Zachód'), false)
  check(label + ': bez <iframe>', /<iframe\b/.test(html), false)
}

/* ---------- C. Spójność ze stroną główną ---------- */

const homeGraph = graphOf(homepage)
const homeListing = suffix => typed(homeGraph, 'RealEstateListing').find(node => node['@id'].endsWith(suffix))
const llms = squeeze(read('llms.txt'))

for (const [path, suffix, unit] of [
  [APARTMENT, '#apartament-nr-4', 'zł'],
  [UNIT, '#lokal-nr-1', 'zł']
]) {
  const label = path.slice(1)
  const html = read(fileFor(path))
  if (html === null) continue

  const expected = homeListing(suffix)
  const price = deepFind(expected.offers, 'price')
  const area = deepFind(expected, 'floorSize').value

  let listing
  try {
    [listing] = typed(graphOf(html), 'RealEstateListing')
  } catch {
    // błąd parsowania zgłoszony już w części B
  }
  check(label + ': RealEstateListing w danych', Boolean(listing), true)
  if (listing) {
    check(label + ': cena jak na stronie głównej', String(deepFind(listing.offers, 'price')), String(price))
    check(label + ': metraż jak na stronie głównej', Number((deepFind(listing, 'floorSize') || {}).value), Number(area))
  }

  const text = visible(html)
  const shownPrice = money(price) + ' ' + unit
  const shownArea = area + ' m²'
  check(label + ': cena widoczna (' + shownPrice + ')', text.includes(shownPrice), true)
  check(label + ': metraż widoczny (' + shownArea + ')', text.includes(shownArea), true)
  check('llms.txt: cena ' + shownPrice, llms.includes(shownPrice), true)
  check('llms.txt: metraż ' + shownArea, llms.includes(shownArea), true)
}

for (const path of SUBPAGES) {
  check('llms.txt: odnośnik ' + path, llms.includes(BASE_URL + path), true)
}

// Zdjęcia wnętrz apartamentu to wizualizacje — nie mogą udawać stanu faktycznego
for (const path of SUBPAGES) {
  const label = path.slice(1)
  const html = read(fileFor(path))
  if (html === null) continue

  const interior = /apartament-(salon|pokoj|lazienka)/
  const shown = tags(html, 'img').filter(tag => interior.test(tag))
  const figures = (html.match(/<figure\b[\s\S]*?<\/figure>/g) || []).filter(figure => interior.test(figure))
  const unlabelled = figures.filter(figure => {
    const caption = figure.match(/<figcaption\b[\s\S]*?<\/figcaption>/)
    return !caption || !/[Ww]izualizacja/.test(caption[0])
  })

  if (path === APARTMENT) check(label + ': galeria wnętrz obecna', shown.length > 0, true)
  check(label + ': wnętrza są w <figure>', figures.length, shown.length)
  check(label + ': podpisy „wizualizacja”', unlabelled.length, 0)
}

globalThis.fetch = realFetch
let bad = 0
for (const [label, ok, detail] of cases) {
  if (!ok) bad++
  console.log(`${ok ? 'OK  ' : 'BŁĄD'}  ${label}: ${detail}`)
}
console.log(bad ? `\n${bad} niepowodzeń` : '\nwszystko przeszło')
process.exit(bad ? 1 : 0)
