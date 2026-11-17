# NextKey CRM — External API (v1)

Read-only access to leads, contacts and the calendar for approved partners.

**Base URL:** `https://crm.nextkey.com.au/api/external/v1`

## Authentication
Send your API key on every request:

```
Authorization: Bearer <your API key>
```

(`X-API-Key: <your API key>` also works.) Keep the key secret and server-side only; never put it in a browser or mobile app. A missing or wrong key returns `401`. Keys can be rotated or revoked at any time — ask us if yours is exposed.

**Limits:** 120 requests per minute per key (`429` with `Retry-After` when exceeded). All endpoints are `GET` only; other methods return `405`. Responses are JSON and never cached.

All timestamps are ISO 8601. Times are stored in UTC; the business runs on Brisbane time (AEST, UTC+10, no daylight saving).

---

## `GET /leads`
Leads, newest first.

| Query | Description |
|---|---|
| `since` | Optional ISO date/time. Only leads created at or after this. Use it to poll for new leads. |
| `limit` | 1–500, default 100 |
| `offset` | Default 0 |

```json
{
  "total": 412, "limit": 100, "offset": 0,
  "leads": [{
    "id": "lead_8f2c…",
    "name": "Jo Bloggs",
    "email": "jo@example.com",
    "phone": "0400 000 000",
    "contact_id": "6b1e…-uuid",
    "source": "springboard-web",
    "pipeline": "Springboard",
    "stage": "Qualified",
    "stage_raw": "Qualified",
    "temperature": "warm",
    "score": 72,
    "buyer_type": "first_home_buyer",
    "state": "QLD",
    "preferred_location": "Logan",
    "tags": ["springboard"],
    "created_at": "2026-11-16 09:12:44"
  }]
}
```

`stage` is the pipeline column the lead sits in; `stage_raw` is the stored value. `phone` comes from the linked contact record and may be `null`. The lead list refreshes about every 60 seconds.

## `GET /leads/{id}`
One lead plus its activity timeline, newest first.

```json
{
  "lead": { "...": "same shape as above" },
  "activity": [
    { "type": "appointment", "at": "2026-11-18T00:00:00Z", "status": "booked", "appointment_id": "…" },
    { "type": "email", "at": "2026-11-16T23:01:00Z", "direction": "outbound", "status": "sent" },
    { "type": "lead_created", "at": "2026-11-16 09:12:44" }
  ]
}
```

Activity records what happened and when. Message content is not included.

## `GET /contacts`
| Query | Description |
|---|---|
| `since` | Optional. Created at or after. |
| `updated_since` | Optional. Updated at or after (use for incremental sync). |
| `limit` / `offset` | As above |

Each contact has: `id`, `name`, `first_name`, `email`, `phone`, `source`, `status`, `temperature`, `state`, `tags`, `created_at`, `updated_at`.

## `GET /appointments`
The CRM calendar.

| Query | Description |
|---|---|
| `from`, `to` | **Required** ISO date/times, at most 100 days apart (by start time) |
| `contact_id` | Optional — one contact's appointments |

Each appointment has: `id`, `title`, `start`, `end`, `status` (`booked` / `rescheduled` / `cancelled`), `host_name`, `host_email`, `contact_id`, `contact_name`, `contact_email`.

To book a lead into a free slot, use the public booking pages (e.g. `https://book.springboardhomes.com.au`) rather than this API.

## Errors
`{"error": "message"}` with `400` (bad query), `401` (key), `404` (not found), `405` (method), `429` (rate limit), `503` (lead store temporarily unavailable — retry later).

## Data handling
This API returns personal information about NextKey's clients and leads. Use it only for the purpose agreed with NextKey, store it securely, don't pass it to anyone else, and delete it when the engagement ends. Every request is logged against your key.
