# 03 · Connect a Next.js site

Your Next.js site **reads** from the panel's public API. The panel does all writing. No shared code,
no shared database access — just HTTP.

Public endpoints (all GET unless noted):

| Endpoint | Returns |
|----------|---------|
| `GET /api/public/properties` | all listings, newest first |
| `GET /api/public/posts` | published posts only |
| `GET /api/public/chatbot/config` | `{ name, greeting, enabled }` |
| `POST /api/public/chatbot/chat` | `{ reply }` for `{ messages: [...] }` (needs Workers AI) |

Set the panel's base URL once:

```
# .env.local
NEXT_PUBLIC_PANEL_URL=https://PROJECT.your-subdomain.workers.dev
```

## Server Components (recommended)

```tsx
// app/nieruchomosci/page.tsx
const API = process.env.NEXT_PUBLIC_PANEL_URL

async function getProperties() {
  const res = await fetch(`${API}/api/public/properties`, { next: { revalidate: 60 } })
  if (!res.ok) throw new Error('Failed to load properties')
  return res.json()
}

export default async function Page() {
  const properties = await getProperties()
  return (
    <ul>
      {properties.map((p: any) => (
        <li key={p.id}>
          <h3>{p.title}</h3>
          <p>{new Intl.NumberFormat('pl-PL').format(p.price)} zł — {p.status}</p>
          {p.imageUrls[0] && <img src={`${API}${p.imageUrls[0]}`} alt={p.title} />}
        </li>
      ))}
    </ul>
  )
}
```

> Image URLs are returned as **relative paths** (`/api/images/...`). Prefix them with the panel URL.

Blog is identical against `/api/public/posts` (fields: `title, slug, excerpt, content, coverImageUrl, createdAt`).

## Chatbot widget (client component)

```tsx
'use client'
import { useState } from 'react'
const API = process.env.NEXT_PUBLIC_PANEL_URL!

export function Chat() {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [input, setInput] = useState('')

  async function send() {
    const next = [...messages, { role: 'user' as const, content: input }]
    setMessages(next); setInput('')
    const res = await fetch(`${API}/api/public/chatbot/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: next }),
    })
    const { reply } = await res.json()
    setMessages([...next, { role: 'assistant', content: reply }])
  }
  // render messages + input → call send()
}
```

## Notes

- Browser CORS on `/api/public/*` permits only the Worker's required `PUBLIC_SITE_ORIGIN`. Set it to
  this Next.js site's exact HTTPS origin.
- For instant updates instead of ISR, use `{ cache: 'no-store' }` on the fetch.
- Never call the admin endpoints (`/api/properties`, etc.) from the site — they require a session.
