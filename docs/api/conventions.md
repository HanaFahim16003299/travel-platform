# API conventions

Shared rules that every module follows. Interactive documentation: `http://localhost:3000/api/docs` (Swagger).

## Base URL and format
- Every route starts with `/api`, for example `GET /api/airports`.
- Requests and responses are JSON. Unknown fields in a request body are rejected with 400.

## Authentication and roles
- `POST /api/auth/login` sets an `access_token` cookie (httpOnly). The session expires after `JWT_EXPIRES_MINUTES` minutes (30).
- Send the cookie with every request (`credentials: 'include'` in the browser).
- Roles: `user`, `admin`, `airline_moderator`, `hotel_moderator`.
- No cookie or an expired one: 401. Wrong role: 403.

## Errors
Every error has the same shape:

```json
{ "statusCode": 400, "error": "Bad Request", "message": ["email must be an email"], "path": "/api/auth/register", "timestamp": "2026-11-26T20:00:00.000Z" }
```

## Pagination (GEN-05)
- Query: `page` (default 1), `limit` (default 10, maximum 100), optional `sort` and `order` (`asc` or `desc`).
- Response: `{ "data": [...], "meta": { "total", "page", "limit", "totalPages" } }`.

## Images (GEN-08)
- JPG or PNG only, at most 5 MB each. Uploaded files are served from `/uploads/<file name>`.

## Reference data (GEN-12, FLT-02)
Public, read-only, paginated. Seeded from `backend/data/reference/*.csv` every time the app starts. Records keep the same `_id` in every database.

| Route | Notes |
|---|---|
| `GET /api/countries` | `code`, `name`, `currency` |
| `GET /api/currencies` | supported currency codes |
| `GET /api/cities` | filters `countryCode`, `q` |
| `GET /api/airports` | filters `q`, `countryCode`, `cityId`; each airport has `iataCode`, `name`, `cityId`, `cityName`, `countryCode`, `countryName`, `timeZone` (IANA) |
| `GET /api/airports/:id` | one airport |
| `GET /api/attractions` | filters `cityId`, `q` |

Other modules store the reference record's `_id` (flights: the airport `_id`; hotels and itineraries: the city `_id`).

## Notifications (GEN-01), logged-in user
`GET /api/notifications` (with `unread=true` optional, includes `unreadCount`), `GET /api/notifications/unread-count`, `PATCH /api/notifications/read-all`, `PATCH /api/notifications/:id/read`.

## Audit log (GEN-07), admin only
`GET /api/admin/audit-logs`, newest first. Filters: `actorId`, `action`, `targetType`, `from`, `to` (ISO 8601).

## Setup
- Copy `backend/.env.example` to `backend/.env` and fill it in. Never commit `.env`.
- Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to get an admin account created at startup (ACC-18). An existing account is never changed.
