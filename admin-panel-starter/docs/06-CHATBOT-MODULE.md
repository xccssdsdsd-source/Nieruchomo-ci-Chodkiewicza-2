# 06 · Chatbot AI module

Lets the client run an AI assistant on their site and **manage it themselves** from the panel — the
name, greeting, system prompt, personality, model, temperature, and a knowledge base of text snippets
and uploaded files. No developer needed for content changes.

## Data model (`src/db/schema.ts`)

- `chatbot_config` — a **single** row: `name, systemPrompt, greeting, model, temperature, enabled`.
- `chatbot_documents` — the knowledge base: `title, content, fileUrl, fileName, enabled`.

## Endpoints

Admin (require login), `src/modules/chatbot.ts`:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/chatbot/config` | read config (auto-creates defaults on first call) |
| PUT | `/api/chatbot/config` | update any config field |
| GET/POST/PATCH/DELETE | `/api/chatbot/documents[/:id]` | knowledge base CRUD |
| POST | `/api/chatbot/test-chat` | try the bot from the panel |

Public (for the live site):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/public/chatbot/config` | `{ name, greeting, enabled }` |
| POST | `/api/public/chatbot/chat` | `{ reply }` for `{ messages: [...] }` |

## How answers are generated

`runChat()` builds the prompt as: **system prompt + all enabled knowledge documents** (their
`content`, capped at ~12k chars), then calls `env.AI.run(model, { messages, temperature })`. This is
simple prompt-stuffing — great up to a few dozen short documents. For large corpora, move to a
Vectorize-backed RAG retrieval step (out of scope for the starter).

## Enabling the AI

The chat endpoints need Cloudflare **Workers AI**. Without it, config + knowledge base still work; only
generation returns `501`.

1. In `wrangler.jsonc`, uncomment:
   ```jsonc
   ,"ai": { "binding": "AI" }
   ```
2. `npm run deploy`.
3. Set a model the panel's **Model** field understands. Good defaults:
   - `@cf/meta/llama-3.1-8b-instruct` (fast, cheap, multilingual)
   - `@cf/qwen/qwen1.5-14b-chat-awq` (stronger)

   Browse models: https://developers.cloudflare.com/workers-ai/models/

The `AI` binding is typed as **optional** in `src/env.d.ts`, so the project builds and runs whether or
not it's enabled.

## Uploaded files

The panel uploads attachments to R2 and stores their URL on the document (`fileUrl`, `fileName`). The
current `runChat()` only feeds the text `content` field to the model — **it does not parse PDFs/Docs**.
To use file contents as knowledge, either paste the text into `content`, or add a parsing/extraction
step on upload. The file link is always shown to the client in the panel.

## What the client can do (no code)

- Rewrite the whole system prompt / personality.
- Add, edit, enable/disable, or delete knowledge snippets.
- Attach files for reference.
- Change model + temperature.
- Toggle the bot on/off (`enabled`), which also gates the public `/chat` endpoint.
- Test the bot live in the "Test rozmowy" panel before it goes to visitors.

## Hardening for production (do this, not optional)

- **Rate limit** `/api/public/chatbot/chat` — Workers AI usage is billable, and this endpoint has no
  auth. Keep the required `CHAT_RATE_LIMITER` binding enabled (already wired into
  `chatbotPublic.post('/chat', ...)` — see `src/lib/rate-limit.ts`).
- Keep required `PUBLIC_SITE_ORIGIN` pinned to the client's exact HTTPS origin.
- Message/knowledge size is already bounded in `src/modules/chatbot.ts`: 2000 chars/message, 10
  messages/request, prompt+knowledge capped at ~12k chars — this bounds worst-case cost per call, it
  doesn't replace the rate limiter.
- The public endpoint accepts only `user` roles. This prevents role spoofing but cannot prevent prompt
  injection or extraction. Treat the system prompt and knowledge base as public data; never store a
  secret, personal data, or private client material there.
- Full threat model: `docs/07-SECURITY.md` §8.
