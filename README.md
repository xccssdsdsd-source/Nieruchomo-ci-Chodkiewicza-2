# Nieruchomości Chodkiewicza 2 — Sieradz

Strona ofertowa budynku mieszkalno-usługowego przy ul. Chodkiewicza 2
w Sieradzu. Strona główna i trzy podstrony w czystym HTML, bez frameworka
i bez kroku budowania, wdrażane na Cloudflare jako Worker ze statycznymi
zasobami.

## Co gdzie leży

| Plik / katalog        | Do czego służy |
|-----------------------|----------------|
| `index.html`          | Strona główna: treść, style i skrypt w jednym pliku |
| `apartament-na-sprzedaz-sieradz.html` | Podstrona oferty sprzedaży apartamentu nr 4 |
| `lokal-uzytkowy-do-wynajecia-sieradz.html` | Podstrona oferty najmu lokalu nr 1 |
| `osiedle-hetmanskie-sieradz.html` | Podstrona lokalizacji i dojazdu |
| `404.html`            | Strona błędu w tej samej szacie graficznej |
| `worker.js`           | `robots.txt`, `sitemap.xml` (ze zdjęciami), przekierowania na adres kanoniczny, odbiór formularza, adresy bezwzględne i data aktualizacji |
| `wrangler.jsonc`      | Konfiguracja wdrożenia |
| `.assetsignore`       | Czego **nie** wysyłać na produkcję |
| `_headers`            | Nagłówki: cache, bezpieczeństwo, polityka CSP |
| `assets/img/`         | Zdjęcia w wariantach webp, ikony, obrazek podglądu linku |
| `assets/fonts/`       | Fraunces i Manrope hostowane lokalnie |
| `assets/podstrona.css` | Wspólne style podstron |
| `assets/podstrona.js` | Zgoda na cookies i Google Analytics na podstronach |
| `llms.txt`            | Streszczenie oferty dla asystentów AI |
| `site.webmanifest`    | Nazwa i ikona przy zapisie na ekranie głównym telefonu |
| `seo.test.mjs`        | Test podstron i adresów: dane spójne ze stroną główną, przekierowania, mapa strony |

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

## Podstrony

Strona główna pozycjonuje się na nazwę budynku. Frazy, którymi ludzie szukają
ofert, obsługują osobne adresy:

| Adres | Fraza główna |
|-------|--------------|
| `/apartament-na-sprzedaz-sieradz` | mieszkanie na sprzedaż Sieradz |
| `/lokal-uzytkowy-do-wynajecia-sieradz` | lokal użytkowy do wynajęcia Sieradz |
| `/osiedle-hetmanskie-sieradz` | Osiedle Hetmańskie Sieradz |

Każda ma własny tytuł, opis, adres kanoniczny, okruszki i dane strukturalne,
a pytania na stronie mają ten sam tekst co blok `FAQPage`. Skróty takie jak
`/apartament`, `/lokal` czy `/dojazd` przekierowują na te adresy (`SHORTCUTS`
w `worker.js`). Obowiązuje ta sama zasada co na stronie głównej: tylko
informacje faktycznie przekazane o budynku i lokalach.

Mapy Google celowo nie ma na podstronach: polityka prywatności opisuje ją
tylko w sekcji „Kontakt” strony głównej, więc zostaje sam link do trasy.

Strona główna nie linkuje do podstron. Wyszukiwarki znajdują je przez mapę
strony, `llms.txt`, stronę 404 i odnośniki między podstronami.

Każda podstrona ma pełny węzeł firmy (`#organizacja`: nazwa, telefon, adres,
współrzędne, mapa) i węzeł miasta (`#sieradz`, z odnośnikiem do Wikipedii,
powiatem i województwem). Adres i telefon są zapisane wszędzie tak samo:
`ul. Chodkiewicza 2, 98-200 Sieradz`, `503 444 134` (`+48503444134` w danych
strukturalnych). `npm test` pilnuje obu rzeczy.

**Formularz na podstronach.** Każda podstrona ma własny formularz w pasie
kontaktu (`#kontakt`), wysyłany na ten sam `/api/lead` co formularz strony
głównej. Temat jest z góry ustawiony na ofertę z danej strony, a wiadomość
wstępnie wypełniona, więc osoba z wyszukiwarki nie musi przechodzić na stronę
główną. Logika jest w `assets/podstrona.js`. Po zgodzie na analitykę skrypt
wysyła do GA4 zdarzenie `generate_lead` (`lead_source`: `telefon`, `email`
albo `formularz`); żeby liczyło się jako konwersja, oznacz je w GA4 jako
kluczowe zdarzenie.

**Rzut apartamentu jest zdjęty z podstrony.** Rzut poddasza pokazuje jedną
łazienkę (7,68 m²), brak garderoby, salon 30,68 m² i sumę 107,07 m², a opis
oferty mówi o dwóch łazienkach, garderobie, 30,5 m² i 105 m². Do czasu
potwierdzenia przez właściciela podstrona pokazuje opis bez rzutu; strona
główna rzut nadal ma.

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

Bez żadnej konfiguracji `/api/lead` wysyła zapytanie przez FormSubmit na adres
`LEAD_EMAIL` z `worker.js` (`robertsieradz@wp.pl`). Warunek jest jednorazowy:
po pierwszym zapytaniu odbiorca musi kliknąć link aktywacyjny, który przyjdzie
na jego skrzynkę.

Kanały opcjonalne ustawia się w panelu Cloudflare (Workers →
nieruchomo-ci-chodkiewicza-2 → Settings → Variables and Secrets). Worker
próbuje ich po kolei i kończy na pierwszym, który przyjmie zapytanie;
FormSubmit zostaje wtedy zabezpieczeniem na końcu kolejki:

- `WEB3FORMS_KEY` — klucz z web3forms.com wystawiony na adres odbiorcy.
- `LEAD_WEBHOOK_URL` — adres webhooka przyjmującego JSON (Make, Zapier, n8n,
  kanał Slacka lub Discorda).
- `RESEND_API_KEY` + `LEAD_FROM` — wysyłka e-mailem przez Resend.
  `LEAD_FROM` musi być adresem na domenie zweryfikowanej w Resend.

`LEAD_TO` zmienia odbiorcę dla wszystkich kanałów wysyłających e-mail. Gdy
zawiodą wszystkie kanały, `/api/lead` zwraca 503, a formularz przechodzi na
wysyłkę przez program pocztowy odwiedzającego — żadne zapytanie nie ginie,
ale nadawca musi kliknąć „wyślij” u siebie.

Formularz ma dwie warstwy ochrony przed botami, obie sprawdzane po stronie
serwera: ukryte pole, które człowiek zostawia puste, oraz próg czasu — zgłoszenie
wysłane szybciej niż w trzy sekundy jest przyjmowane i po cichu odrzucane.

## Aktualizacja oferty

Cena, metraż i opisy są wpisane wprost w plikach HTML. Przy zmianie oferty
pamiętaj o czterech miejscach:

1. Treść sekcji i tabel danych w `index.html`.
2. Blok `application/ld+json` na dole `index.html` — dane strukturalne dla
   wyszukiwarek.
3. Podstrony: strona danej oferty (treść i `ld+json`), tabela lokali
   w `osiedle-hetmanskie-sieradz.html` oraz ceny w stopce i w „Zobacz też”.
4. `llms.txt` — streszczenie dla asystentów AI.

`npm test` wyłapie rozjazd ceny lub metrażu między stroną główną a podstronami.

**Datę „Stan oferty” każda strona ma własną**, w znaczniku:

```html
<time id="updated" datetime="2026-11-05">5 listopada 2026</time>
```

Worker odczytuje z niego `lastmod` tej strony w mapie **oraz `dateModified`
w danych strukturalnych**, podmieniając je przy każdym żądaniu. Data w bloku
`ld+json` jest więc tylko wartością wyjściową — nie da się jej rozjechać z tym,
co widać na stronie. Po potwierdzeniu aktualności ofert popraw datę
w `index.html` i we wszystkich trzech podstronach.

Po zmianie `assets/podstrona.css` albo `assets/podstrona.js` podbij numer `?v=`
w odnośnikach na podstronach: pliki z `assets/` przeglądarki trzymają 7 dni.

## Adres strony

Strona działa pod adresem `https://chodkiewicza2.pl`. Stała `CANONICAL_HOST`
w `worker.js` wskazuje tę domenę: żądania GET i HEAD pod `www.` oraz po
`http://` dostają przekierowanie 301 na ten adres, żeby wyszukiwarki widziały
jedną wersję strony. Na adresach roboczych `*.workers.dev` i `*.pages.dev`
strona działa bez przekierowania, ale jej adres kanoniczny wskazuje domenę
właściwą.

W plikach HTML i w `llms.txt` adresy kanoniczny, Open Graph, linki i pola
w danych strukturalnych są bezwzględne i wskazują na
`https://nieruchomo-ci-chodkiewicza-2.pages.dev`. Worker podmienia ten adres
na host bieżącego żądania. Przy zmianie domeny wystarczy więc poprawić
`CANONICAL_HOST`. Wartość `BASE_URL` w `worker.js` jest tylko zapasowa.
