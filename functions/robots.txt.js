/**
 * robots.txt z absolutnym adresem mapy strony, wyliczanym z hosta żądania.
 * Crawlery klasyczne i asystenci AI (GPTBot, PerplexityBot, ClaudeBot,
 * Google-Extended) mają pełny dostęp — treść ofert ma być cytowalna.
 */
export function onRequestGet ({ request }) {
  const origin = new URL(request.url).origin
  const body = [
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
    'Host: ' + new URL(request.url).host,
    ''
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  })
}
