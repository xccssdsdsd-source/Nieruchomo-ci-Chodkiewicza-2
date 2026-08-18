/**
 * Mapa strony generowana z hosta żądania — działa na dowolnej domenie
 * (podglądowej *.pages.dev i docelowej), bez wpisywania adresu na sztywno.
 */
export function onRequestGet ({ request }) {
  const origin = new URL(request.url).origin
  const lastmod = '2026-08-18'
  const urls = [
    { loc: origin + '/', priority: '1.0' },
    { loc: origin + '/#apartament', priority: '0.9' },
    { loc: origin + '/#lokal', priority: '0.9' },
    { loc: origin + '/#lokalizacja', priority: '0.6' },
    { loc: origin + '/#faq', priority: '0.6' },
    { loc: origin + '/#kontakt', priority: '0.7' }
  ]
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u =>
      '  <url>\n' +
      '    <loc>' + u.loc + '</loc>\n' +
      '    <lastmod>' + lastmod + '</lastmod>\n' +
      '    <changefreq>weekly</changefreq>\n' +
      '    <priority>' + u.priority + '</priority>\n' +
      '  </url>'
    ).join('\n') +
    '\n</urlset>\n'

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  })
}
