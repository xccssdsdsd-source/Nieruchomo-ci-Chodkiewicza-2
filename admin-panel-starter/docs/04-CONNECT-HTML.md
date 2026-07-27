# 04 · Connect a plain HTML site

The panel exposes a public JSON API with CORS restricted to `PUBLIC_SITE_ORIGIN`, so the configured static HTML page can fetch it directly with
vanilla JS. No build tools required.

Endpoints are the same as in `03-CONNECT-NEXTJS.md`:

| Endpoint | Returns |
|----------|---------|
| `GET /api/public/properties` | all listings |
| `GET /api/public/posts` | published posts |
| `GET /api/public/chatbot/config` | `{ name, greeting, enabled }` |
| `POST /api/public/chatbot/chat` | `{ reply }` (needs Workers AI) |

## Listings

```html
<div id="listings"></div>
<script>
  const API = 'https://PROJECT.your-subdomain.workers.dev'
  fetch(`${API}/api/public/properties`)
    .then((r) => r.json())
    .then((items) => {
      document.getElementById('listings').innerHTML = items
        .map(
          (p) => `
        <article>
          ${p.imageUrls[0] ? `<img src="${API}${p.imageUrls[0]}" alt="${p.title}">` : ''}
          <h3>${p.title}</h3>
          <p>${new Intl.NumberFormat('pl-PL').format(p.price)} zł — ${p.status}</p>
        </article>`,
        )
        .join('')
    })
</script>
```

> Image URLs come back as relative paths (`/api/images/...`) — prefix them with `API`.

## Blog

Same pattern against `/api/public/posts`. Each post has `title, slug, excerpt, content, coverImageUrl, createdAt`.

## Chatbot bubble (drop-in)

```html
<div id="chat"></div>
<script>
  const API = 'https://PROJECT.your-subdomain.workers.dev'
  const messages = []
  const box = document.getElementById('chat')

  fetch(`${API}/api/public/chatbot/config`)
    .then((r) => r.json())
    .then((c) => { if (c.enabled) box.dataset.greeting = c.greeting })

  async function send(text) {
    messages.push({ role: 'user', content: text })
    const res = await fetch(`${API}/api/public/chatbot/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    })
    const { reply } = await res.json()
    messages.push({ role: 'assistant', content: reply })
    return reply
  }
  // wire an input box → send(text) → render reply
</script>
```

## Tips

- Keep the `API` constant in one place so you can swap it per environment.
- If you host the HTML on the same domain as the Worker (via a route/custom domain), you can drop the
  absolute `API` prefix entirely and use relative paths.
- The panel itself (`/admin.html`) is already served by the Worker — send the client there to manage content.
