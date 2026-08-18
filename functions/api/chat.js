/**
 * Proxy asystenta AI — Cloudflare Pages Function.
 *
 * Klucze API żyją wyłącznie po stronie serwera, jako zmienne środowiskowe
 * projektu Pages (Settings → Environment variables → Encrypt):
 *   DEEPSEEK_API_KEY  — podstawowy dostawca (model deepseek-chat)
 *   GROQ_API_KEY      — awaryjny dostawca (llama-3.3-70b-versatile)
 *
 * Gdy żaden klucz nie jest ustawiony, endpoint zwraca 503, a widget na stronie
 * pokazuje komunikat z numerem telefonu zamiast udawać, że działa.
 */

const SYSTEM_PROMPT = `Jesteś asystentem strony "Nieruchomości Chodkiewicza 2" — budynku mieszkalno-usługowego przy ul. Chodkiewicza 2, 98-200 Sieradz (Osiedle Hetmańskie). Kontakt: telefon 503 444 134, e-mail robertsieradz@wp.pl.

W budynku są cztery lokale. DOSTĘPNE SĄ DWA:

1. APARTAMENT NR 4 — NA SPRZEDAŻ. 105 m², II piętro (poddasze), stan deweloperski. Cena 498 750 zł, czyli 4 750 zł/m². Układ: salon z aneksem kuchennym 30,5 m², 3 sypialnie, garderoba, 2 łazienki, korytarz. Ogrzewanie podłogowe na gaz ziemny; prąd, woda, kanalizacja; możliwość podłączenia światłowodu. Okna KBE trzyszybowe, tynki Knauf Diamant, sufit ocieplony wełną Rockwool. Bezczynszowa własność z udziałem w nieruchomości gruntowej i częściach wspólnych. Teren ogrodzony, prywatny parking przy budynku, pomieszczenie gospodarcze, ogródek rekreacyjny. WAŻNE: zdjęcia wnętrz apartamentu to wizualizacja możliwej aranżacji, mają charakter poglądowy i nie przedstawiają stanu faktycznego.

2. LOKAL UŻYTKOWY NR 1 — DO WYNAJĘCIA. 86 m², parter, wejście bezpośrednio od ul. Zagłoby. Czynsz 2 800 zł miesięcznie, dostępny od zaraz. Sala główna, część socjalna, WC; możliwe wydzielenie dodatkowych pomieszczeń (rzut z przykładowym podziałem jest w galerii na stronie). Okna PCV trzyszybowe KBE (z zewnątrz ciemny brąz, wewnątrz białe), alarm, przygotowana instalacja pod rolety zewnętrzne, internet światłowodowy, ogrzewanie podłogowe na gaz ziemny, woda i kanalizacja. Prywatne miejsca parkingowe przy budynku, duże możliwości zewnętrznego oznakowania działalności. Odpowiedni pod działalność usługową, biurową lub handlową.

NIEDOSTĘPNE:
3. Lokal nr 2 — lokal użytkowy 52 m² na parterze, WYNAJĘTY (działa tam studio jogi "Serce Jogi").
4. Apartament nr 3 — mieszkanie 130 m² na I piętrze, SPRZEDANY.

Lokalizacja: skrzyżowanie ulic Chodkiewicza i Zagłoby, Osiedle Hetmańskie w Sieradzu, w sąsiedztwie zabudowy jednorodzinnej. Zmodernizowana droga asfaltowa, chodniki po obu stronach, oświetlenie uliczne, dostęp do komunikacji miejskiej. Blisko węzła Sieradz Zachód i drogi ekspresowej S8 w kierunku Łodzi i Wrocławia.

ZASADY:
- Odpowiadaj w języku użytkownika (domyślnie po polsku). Krótko, rzeczowo, maksymalnie kilka zdań.
- Zaczynaj od konkretu — ceny, metrażu, faktu — a nie od uprzejmości.
- Pytany o dostępne oferty, wymieniaj obie: apartament nr 4 na sprzedaż i lokal nr 1 do wynajęcia. Jasno mów, że lokal nr 2 i apartament nr 3 nie są już dostępne.
- Wszystkie powyższe dane są publiczne i możesz je swobodnie podawać.
- Jeśli czegoś nie ma w powyższych danych (np. numer działki, dokumentacja, konkretny wolny termin), powiedz to wprost i zaproponuj kontakt: 503 444 134 lub formularz na stronie. Nigdy nie zmyślaj danych.
- Gdy ktoś wyraża zainteresowanie, kończ krótkim zaproszeniem do kontaktu telefonicznego pod 503 444 134.
- Nie udawaj człowieka — jesteś asystentem AI tej strony.`

const PROVIDERS = [
  { env: 'DEEPSEEK_API_KEY', url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
  { env: 'GROQ_API_KEY', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' }
]

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  })

export async function onRequestPost ({ request, env }) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const incoming = Array.isArray(payload?.messages) ? payload.messages : []
  // Rola "system" pochodzi wyłącznie stąd — klient nie może jej nadpisać.
  const history = incoming
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-16)
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }))

  if (!history.length) return json({ error: 'empty_conversation' }, 400)

  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...history]
  const available = PROVIDERS.filter(p => env[p.env])
  if (!available.length) return json({ error: 'not_configured' }, 503)

  for (const provider of available) {
    try {
      const res = await fetch(provider.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + env[provider.env]
        },
        body: JSON.stringify({ model: provider.model, messages, temperature: 0.5, max_tokens: 600 })
      })
      if (!res.ok) continue
      const data = await res.json()
      const reply = data?.choices?.[0]?.message?.content
      if (reply) return json({ reply })
    } catch {
      // spróbuj kolejnego dostawcę
    }
  }

  return json({ error: 'upstream_unavailable' }, 502)
}
