# Nieruchomości Chodkiewicza 2 — Sieradz

Strona ofertowa budynku mieszkalno-usługowego przy ul. Chodkiewicza 2
w Sieradzu. Jedna strona HTML bez frameworka i bez kroku budowania,
wdrażana na Cloudflare jako Worker ze statycznymi zasobami.

## Co gdzie leży

| Plik / katalog        | Do czego służy |
|-----------------------|----------------|
| `index.html`          | Cała strona: treść, style i skrypt w jednym pliku |
| `404.html`            | Strona błędu w tej samej szacie graficznej |
| `worker.js`           | `robots.txt`, `sitemap.xml` (ze zdjęciami), odbiór formularza, adresy bezwzględne i data aktualizacji |
| `wrangler.jsonc`      | Konfiguracja wdrożenia |
| `.assetsignore`       | Czego **nie** wysyłać na produkcję |
| `_headers`            | Nagłówki: cache, bezpieczeństwo, polityka CSP |
| `assets/img/`         | Zdjęcia w wariantach webp, ikony, obrazek podglądu linku |
| `assets/fonts/`       | Fraunces i Manrope hostowane lokalnie |
| `llms.txt`            | Streszczenie oferty dla asystentów AI |
| `site.webmanifest`    | Nazwa i ikona przy zapisie na ekranie głównym telefonu |

Katalogi `Apartamentnasprzedaż/`, `Lokal nr1/`, `Lokalnr3sprzeedany/`,
`Lokalużytkowynr2wynajęty/` i `admin-panel-starter/` zostają w repozytorium
jako archiwum, ale nie trafiają do wdrożenia — wyklucza je `.assetsignore`.

## Układ strony

Sekcje idą w jednej, ustalonej kolejności — od ogółu do konkretu:

1. **Ekran startowy** (`#top`) — sama nazwa nieruchomości i dwa przyciski:
   do dostępnych lokali i do kontaktu. Bez cen i opisów.
2. **O nas** (`#o-nas`) — kim jesteśmy, czym jest ten budynek, gdzie stoi.
3. **Wszystkie lokale** (`#lokale`) — cztery lokale 01–04 ze statusem
   dostępności; dostępne są klikalne i prowadzą do swojej sekcji.
4. **Apartament nr 4** (`#apartament`) — oferta sprzedaży, dane, rzut, galeria.
5. **Lokal nr 1** (`#lokal`) — oferta najmu, dane, przykładowy podział, galeria.
6. **Pytania i odpowiedzi** (`#faq`) — wyłącznie pytania, na które odpowiedź
   wynika z treści powyżej.
7. **Kontakt** (`#kontakt`) — telefon, e-mail, adres, formularz i mapa.
8. **Polityka prywatności** (`#prywatnosc`).

Na stronie znajdują się tylko informacje faktycznie przekazane o budynku
i lokalach. Jeśli czegoś nie wiadomo (godziny otwarcia, wysokość kaucji,
numer działki), nie zgadujemy — zostaje to do rozmowy telefonicznej.

## Praca lokalna

```bash
npm install
npm run dev      # wrangler dev — pełne środowisko z workerem
npm run check    # wrangler deploy --dry-run, sprawdza konfigurację bez wdrażania
```

## Wdrożenie

Push do gałęzi `main` uruchamia build w Cloudflare, który wykonuje
`npx wrangler deploy`. Konfiguracja jest w `wrangler.jsonc`.

**Uwaga na `.assetsignore`.** Build instaluje zależności do `node_modules`,
a `wrangler deploy` domyślnie wysłałby cały katalog projektu jako zasoby.
Bez listy wykluczeń wdrożenie przerywa się na pliku `node_modules/workerd/bin/workerd`
ważącym 144 MiB przy limicie 25 MiB na zasób. Jeśli kiedyś build zacznie padać
z komunikatem „Asset too large”, sprawdź najpierw, czy ten plik nadal istnieje.

## Formularz kontaktowy

Bez konfiguracji `/api/lead` zwraca 503, a formularz przechodzi na wysyłkę
przez program pocztowy odwiedzającego — żadne zapytanie nie ginie, ale
nadawca musi kliknąć „wyślij” u siebie.

Żeby zapytania trafiały prosto do skrzynki, ustaw w panelu Cloudflare
(Workers → nieruchomo-ci-chodkiewicza-2 → Settings → Variables and Secrets)
**jedną** z dwóch dróg:

- `LEAD_WEBHOOK_URL` — adres webhooka przyjmującego JSON (Make, Zapier, n8n,
  kanał Slacka lub Discorda). Najprostsze rozwiązanie, bez weryfikacji domeny.
- `RESEND_API_KEY` + `LEAD_FROM` — wysyłka e-mailem przez Resend.
  `LEAD_FROM` musi być adresem na domenie zweryfikowanej w Resend.
  Opcjonalnie `LEAD_TO` zmienia odbiorcę (domyślnie `robertsieradz@wp.pl`).

Formularz ma dwie warstwy ochrony przed botami, obie sprawdzane po stronie
serwera: ukryte pole, które człowiek zostawia puste, oraz próg czasu — zgłoszenie
wysłane szybciej niż w trzy sekundy jest przyjmowane i po cichu odrzucane.

## Aktualizacja oferty

Cena, metraż i opisy są wpisane wprost w `index.html`. Przy zmianie oferty
pamiętaj o trzech miejscach:

1. Treść sekcji i tabel danych.
2. Blok `application/ld+json` na dole pliku — dane strukturalne dla wyszukiwarek.
3. `llms.txt` — streszczenie dla asystentów AI.

**Datę „Stan ofert” zmieniasz tylko raz**, w znaczniku:

```html
<time id="updated" datetime="2026-08-19">19 sierpnia 2026</time>
```

Worker odczytuje z niego `lastmod` w mapie strony **oraz `dateModified`
w danych strukturalnych**, podmieniając je przy każdym żądaniu. Data w bloku
`ld+json` jest więc tylko wartością wyjściową — nie da się jej rozjechać z tym,
co widać na stronie.

## Adres strony

W `index.html` i w `llms.txt` adresy kanoniczny, Open Graph, linki i pola
w danych strukturalnych są bezwzględne i wskazują na
`https://nieruchomo-ci-chodkiewicza-2.pages.dev`. Worker podmienia ten adres
na host bieżącego żądania dla obu plików, więc **po podpięciu domeny własnej
nie trzeba niczego zmieniać w kodzie** — strona i llms.txt same zaczną
podawać nowy adres. Wartość w `worker.js` (`BASE_URL`) jest tylko zapasowa.
