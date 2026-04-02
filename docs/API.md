# FileDrop — API Dokumentácia

Base URL: `/api`

## Verejné endpointy

### GET /api/config

Vráti verejné nastavenia pre frontend (bez autentifikácie).

**Response 200:**
```json
{
  "shareExpiryOptions": [1, 7, 14, 30, 90],
  "shareDefaultExpiryDays": 30
}
```

`shareExpiryOptions` — hodnoty v dňoch, ktoré sa zobrazujú v UI pri vytváraní zdieľania (konfigurovateľné cez `SHARE_EXPIRY_OPTIONS_DAYS`).
`shareDefaultExpiryDays` — predvolená hodnota (musí byť v `shareExpiryOptions`).

---

### GET /api/health

`{ "status": "ok", "timestamp": "..." }`

---

## Autentifikácia

### POST /api/auth/request-otp

Odošle jednorazový overovací kód na e-mail.

**Request:**
```json
{ "email": "user@example.com", "locale": "en" }
```

`locale` (voliteľné) — jazyk e-mailu: `en`, `cs`, `sk`, `uk`. Ostatné jazyky → fallback na `en`. Frontend používa jazyk z UI (pri OTP aj zálohu z `localStorage.i18nextLng`).

**Response 200:**
```json
{ "message": "OTP sent", "email": "user@example.com" }
```

**Response 403:** E-mailová doména nie je povolená
**Response 429:** Príliš veľa pokusov (rate limit)

---

### POST /api/auth/verify-otp

Overí OTP kód a vráti JWT token.

**Request:**
```json
{ "email": "user@example.com", "code": "123456" }
```

**Response 200:**
```json
{
  "token": "eyJhbGciOi...",
  "user": { "id": "uuid", "email": "user@example.com" }
}
```

**Response 401:** Neplatný alebo expirovaný kód
**Response 429:** Príliš veľa pokusov (rate limit)

---

## Zdieľania (vyžaduje JWT)

### POST /api/shares

Vytvorí nové zdieľanie.

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "allowRecipientUpload": true,
  "expiresInDays": 30,
  "maxDownloads": 5
}
```

`expiresInDays` — musí byť jedna z hodnôt z `GET /api/config` → `shareExpiryOptions`.
`maxDownloads` (voliteľné) — maximálny počet stiahnutí. `null` alebo `0` = neobmedzené.

**Response 201:**
```json
{
  "id": "uuid",
  "slug": "aBcDeFgHiJkL",
  "allowRecipientUpload": true,
  "expiresAt": "2026-04-04T...",
  "createdAt": "2026-03-05T..."
}
```

---

### GET /api/shares

Zoznam mojich zdieľaní.

**Headers:** `Authorization: Bearer <token>`

**Response 200:**
```json
[
  {
    "id": "uuid",
    "slug": "aBcDeFgHiJkL",
    "allowRecipientUpload": true,
    "expiresAt": "2026-04-04T...",
    "downloadCount": 5,
    "maxDownloads": 5,
    "createdAt": "2026-03-05T...",
    "fileCount": 3,
    "parentShareId": null
  }
]
```

`parentShareId` je `null` pre bežné zdieľania a obsahuje UUID pôvodného share pre reply zdieľania.

---

### GET /api/shares/:slug

Verejný endpoint — metadata zdieľania vrátane zoznamu súborov.

**Response 200:**
```json
{
  "slug": "aBcDeFgHiJkL",
  "allowRecipientUpload": true,
  "expiresAt": "2026-04-04T...",
  "parentShareId": null,
  "maxDownloads": 5,
  "downloadCount": 3,
  "files": [
    {
      "id": "uuid",
      "encryptedName": "{\"iv\":\"...\",\"data\":\"...\"}",
      "size": "1048576",
      "chunkCount": 1,
      "uploadedBy": "OWNER",
      "createdAt": "2026-03-05T..."
    }
  ]
}
```

**Response 404:** Zdieľanie neexistuje
**Response 410:** Zdieľanie expirovalo **alebo bol dosiahnutý limit stiahnutí**

---

### DELETE /api/shares/:slug

Zmaže zdieľanie, všetky súbory a šifrované chunky z disku. Vyžaduje JWT vlastníka.

**Headers:** `Authorization: Bearer <token>`

**Response 200:**
```json
{ "message": "Share deleted" }
```

Mazanie odstráni:
1. Všetky záznamy `Chunk`, `FileRecord` z databázy
2. Šifrované chunky z filesystému (`/data/uploads/<shareId>/`)
3. Adresár zdieľania
4. Záznam `Share` z databázy

---

## Reply Share (spätný upload príjemcu)

### POST /api/shares/:slug/reply

Vytvorí nový reply share naviazaný na pôvodné zdieľanie. Nevyžaduje autentifikáciu — volá ho príjemca.

**Request:**
```json
{
  "expiresInDays": 7
}
```

`expiresInDays` je voliteľné — default sa berie z `REPLY_SHARE_EXPIRY_DAYS` (7 dní).

**Response 201:**
```json
{
  "id": "uuid",
  "slug": "xYzWaBcDeFgH",
  "parentShareId": "uuid-povodneho-share",
  "expiresAt": "2026-03-12T...",
  "createdAt": "2026-03-05T..."
}
```

---

### POST /api/shares/:slug/notify-owner

Odošle e-mail vlastníkovi pôvodného zdieľania s odkazom na reply share. Volá ho frontend po úspešnom uploade.

**Request:**
```json
{ "shareUrl": "https://...", "locale": "en" }
```

`locale` (voliteľné) — jazyk e-mailu: `en`, `cs`, `sk`, `uk`. Ostatné jazyky → fallback na `en`.

**Response 200:**
```json
{ "message": "Owner notified" }
```

**Response 404:** Pôvodné zdieľanie neexistuje alebo nemá vlastníka

---

## Upload súborov

### POST /api/shares/:slug/files/init

Inicializuje upload nového súboru.

**Headers:** `Authorization: Bearer <token>` (voliteľné — povinné len pre vlastníka)

**Request:**
```json
{
  "encryptedName": "{\"iv\":\"...\",\"data\":\"...\"}",
  "size": 10485760,
  "chunkCount": 2,
  "uploadedBy": "OWNER"
}
```

Oprávnenie na upload:
- **Vlastník** — vždy povolené
- **Príjemca** — povolené ak `allowRecipientUpload = true` alebo ak ide o reply share
- **Inak** — 403 Forbidden

**Response 201:**
```json
{ "fileId": "uuid" }
```

---

### POST /api/shares/:slug/files/:fileId/chunks/:index

Nahrá šifrovaný chunk.

**Headers:**
- `Content-Type: application/octet-stream`
- `X-Chunk-IV: <base64url IV>`

**Body:** Binary data (šifrovaný chunk, max ~5 MB + encryption overhead)

**Response 200:**
```json
{ "chunkIndex": 0, "size": 5242944 }
```

**Response 507:** Disk plný — server nemôže prijať nové dáta

---

### POST /api/shares/:slug/files/:fileId/complete

Označí upload súboru ako dokončený.

**Response 200:**
```json
{ "message": "File upload completed", "fileId": "uuid" }
```

---

### DELETE /api/shares/:slug/files/:fileId

Zmaže konkrétny súbor zo zdieľania. Vyžaduje JWT vlastníka.

**Headers:** `Authorization: Bearer <token>`

**Response 200:**
```json
{ "message": "File deleted" }
```

Odstráni záznam `FileRecord`, všetky `Chunk` záznamy a šifrované chunky z disku.

---

## Download súborov

### GET /api/shares/:slug/files/:fileId/chunks/:index

Stiahne šifrovaný chunk.

**Response Headers:**
- `Content-Type: application/octet-stream`
- `X-Chunk-IV: <base64url IV>`

**Response Body:** Binary data (šifrovaný chunk)

**Response 410:** Zdieľanie expirovalo alebo bol dosiahnutý limit stiahnutí

---

## Admin API (vyžaduje admin JWT)

Všetky admin endpointy vyžadujú JWT token s e-mailom nakonfigurovaným v `ADMIN_EMAILS`.

### GET /api/admin/stats

Agregované štatistiky.

**Response 200:**
```json
{
  "totalShares": 42,
  "activeShares": 15,
  "expiredSharesPending": 27,
  "totalFiles": 89,
  "totalStorageBytes": "1073741824",
  "totalUsers": 5,
  "totalDownloads": 120,
  "sharesCreatedToday": 3,
  "sharesCreatedThisWeek": 12,
  "sharesCreatedThisMonth": 28
}
```

---

### GET /api/admin/stats/timeline

Historické štatistiky z denných snapshotov.

**Query parametre:**
- `days` (default: 30, max: 365) — počet dní dozadu
- `metric` — metrika: `sharesCreated`, `sharesActive`, `totalFiles`, `totalStorageBytes`, `totalUsers`, `totalDownloads`

**Response 200:**
```json
[
  { "date": "2026-03-15", "value": 5 },
  { "date": "2026-03-16", "value": 8 }
]
```

---

### GET /api/admin/shares

Paginovaný zoznam zdieľaní.

**Query parametre:** `page`, `limit`, `status` (all/active/expired), `search`, `sort`, `order`

---

### GET /api/admin/shares/:slug

Detail zdieľania vrátane súborov a reply shares.

---

### DELETE /api/admin/shares/:slug

Zmaže zdieľanie. Vyžaduje admin rolu (`requireAdminWrite`).

---

### GET /api/admin/system

Systémové informácie: disk usage a zoznam cron jobov.

**Response 200:**
```json
{
  "disk": {
    "uploadDirPath": "/data/uploads",
    "uploadDirSizeBytes": "524288000",
    "diskTotalBytes": "107374182400",
    "diskFreeBytes": "53687091200",
    "diskUsedPercent": 50
  },
  "cronJobs": [
    {
      "id": "cleanup",
      "name": "Expired Shares Cleanup",
      "description": "...",
      "schedule": "0 */6 * * *",
      "enabled": true,
      "lastRunAt": "2026-03-16T12:00:00Z",
      "nextRunAt": "2026-03-16T18:00:00Z"
    }
  ]
}
```

---

### PUT /api/admin/cron-jobs/:id

Zmení rozvrh alebo stav cron jobu. Vyžaduje admin rolu.

**Request:**
```json
{ "schedule": "0 */4 * * *", "enabled": true }
```

---

### POST /api/admin/cron-jobs/:id/run

Manuálne spustí cron job. Vyžaduje admin rolu.

---

### GET /api/admin/cleanup-logs

Paginované záznamy o čistení. Query: `page`, `limit`.

---

### POST /api/admin/cleanup/run

Manuálne spustí cleanup. Vyžaduje admin rolu.

---

### GET /api/admin/security/status

Vráti aktuálny stav bezpečnostných ochran. Vyžaduje admin rolu.

**Response 200:**
```json
{
  "jwtSecret": { "level": "warn", "reasons": ["too_short_warn"], "length": 36 },
  "jwtSecretSafe": false,
  "smtpConfigured": true,
  "diskMonitorActive": true,
  "adminNotifyConfigured": true,
  "jwtAlgorithmPinned": true,
  "rateLimitingActive": true,
  "inputValidationActive": true,
  "pathTraversalProtection": true,
  "securityHeadersActive": true,
  "securityLoggingActive": true
}
```

`jwtSecret.level` — `"ok"` / `"warn"` / `"error"`. `jwtSecret.reasons` — pole kódov (napr. `placeholder`, `too_short_warn`, `too_short_critical`, `contains_domain`, `no_special`, `low_variety`).

---

### GET /api/admin/security/stats

Agregované štatistiky bezpečnostných udalostí. Vyžaduje admin rolu.

**Response 200:**
```json
{
  "byType": {
    "24h": { "auth_failed": 2, "rate_limited": 5 },
    "7d":  { "auth_failed": 10 },
    "30d": { "auth_failed": 35 }
  },
  "topIps": [{ "ip": "192.168.1.1", "count": 12 }],
  "daily": [{ "date": "2026-03-17", "event": "rate_limited", "count": 5 }]
}
```

---

### GET /api/admin/security/events

Paginovaný zoznam bezpečnostných udalostí. Vyžaduje admin rolu.

**Query parametre:** `page` (default 1), `limit` (default 15, max 100), `event` (filter na typ), `ip` (filter na IP), `days` (1/7/30, default 7).

**Response 200:**
```json
{
  "data": [
    { "id": "uuid", "event": "rate_limited", "ip": "1.2.3.4", "method": "POST", "path": "/api/auth/request-otp", "details": "{\"limiter\":\"otp\"}", "createdAt": "2026-03-17T10:00:00Z" }
  ],
  "pagination": { "page": 1, "limit": 15, "total": 42, "totalPages": 3 }
}
```

Typy udalostí: `auth_failed`, `admin_denied`, `otp_invalid`, `rate_limited`, `path_traversal`, `invalid_input`.

---

## Health Check

### GET /api/health

Kontrola stavu backendu vrátane DB konektivity a disku.

**Response 200:**
```json
{
  "status": "ok",
  "timestamp": "2026-03-17T08:00:00.000Z",
  "checks": { "db": "ok", "disk": "ok" },
  "disk": { "freePercent": 85.5 }
}
```

**Response 503:** DB nedostupná alebo disk v kritickom stave (`status: "degraded"`)

---

## Rate Limiting

Všetky endpointy sú chránené rate limitmi. Odpoveď 429 obsahuje `RateLimit-*` hlavičky (RFC draft).

| Endpoint | Limit | Kľúč |
|----------|-------|------|
| POST /api/auth/request-otp | 5 req / 15 min | email alebo IP |
| POST /api/auth/verify-otp | 10 req / 15 min | email alebo IP |
| POST /api/shares | 20 req / min | IP |
| POST /api/shares/:slug/files/:id/chunks/:idx | 200 req / min | IP |
| GET /api/shares/:slug/files/:id/chunks/:idx | 100 req / min | IP |
| /api/admin/* | 60 req / min | IP |

---

## Validácia vstupov

Všetky endpointy validujú vstupné parametre:

| Parameter | Pravidlá |
|-----------|----------|
| `email` | Max 254 znakov, email regex |
| `code` (OTP) | Presne 6 číslic |
| `slug` | Max 64 znakov, `/^[a-zA-Z0-9_-]+$/` |
| `fileId` | UUID formát |
| `encryptedName` | Max 1024 znakov |
| `X-Chunk-IV` | Max 64 znakov, base64 |
| `locale` | Max 10 znakov |
| `shareUrl` | Max 2048 znakov |
| `search` (admin) | Max 200 znakov |
| `schedule` (cron) | Max 100 znakov |

Neplatné vstupy vrátia HTTP 400.

---

## Chybové kódy

| Kód | Význam |
|-----|--------|
| 400 | Neplatný vstup (validácia, chýbajúce parametre) |
| 401 | Chýbajúci alebo neplatný JWT token |
| 403 | Nedostatočné oprávnenia (doména, admin rola) |
| 404 | Zdieľanie, súbor alebo chunk neexistuje |
| 409 | Upload súboru už bol dokončený |
| 410 | Zdieľanie expirovalo alebo dosiahnutý limit stiahnutí |
| 413 | Súbor príliš veľký |
| 429 | Rate limit prekročený |
| 507 | Disk plný (kritický stav) |
