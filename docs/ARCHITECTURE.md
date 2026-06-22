# FileDrop — Architektúra

## Prehľad

FileDrop je webová aplikácia pre dočasné zdieľanie súborov s end-to-end (E2E) šifrovaním. Súbory sú šifrované priamo v prehliadači používateľa pomocou Web Crypto API (AES-256-GCM) a šifrovací kľúč nikdy neopustí klientskú stranu.

## Tech Stack

| Komponent | Technológia |
|-----------|------------|
| Backend | Node.js + Express + TypeScript |
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Databáza | PostgreSQL 16 |
| ORM | Prisma 6 |
| E-mail | Nodemailer + SMTP / Exchange Online OAuth2 |
| Šifrovanie | Web Crypto API (AES-256-GCM) |
| i18n | i18next + react-i18next + browser language detector |
| Kontajnerizácia | Docker + Docker Compose |
| Reverse proxy | Nginx (HTTP / SSL) |
| Admin konzola | React 18 + Vite + TypeScript + Tailwind CSS + Recharts |

## Kontajnery

```
                        ┌─────────────────┐
                        │  Externý proxy   │  ← SSL_MODE=external
                        │  (Apache/Nginx)  │
                        └────────┬────────┘
                                 │
┌────────────────────────────────┼──────────────────────────────┐
│ Docker Compose                 │                              │
│                                ▼                              │
│  ┌──────────────────────┐  ┌──────────┐  ┌───────────────┐   │
│  │     Frontend          │  │ Backend  │  │  PostgreSQL    │   │
│  │     (Nginx)           │─▶│ (Express)│─▶│  :5432         │   │
│  │  /        → SPA       │  │ :3000    │  └───────────────┘   │
│  │  /admin/  → Admin SPA │  └────┬─────┘                      │
│  │  /api/    → backend   │       │                            │
│  │  :80 (HTTP)           │       ▼                            │
│  │  :443 (SSL, override) │   /data/uploads                    │
│  └──────────────────────┘    (Docker volume)                  │
│       │                                                        │
│       ▼                                                        │
│  :8080 (HTTP)                                                  │
│  :8443 (SSL — len cez docker-compose.ssl.yml override)         │
└───────────────────────────────────────────────────────────────┘
```

Po refactore (v1.1.0) beží stack v 2 aplikačných kontajneroch (`backend`, `frontend`) + `postgres`. Admin SPA je zabudovaná do frontend image pod `/admin/` a zdieľa nginx, port aj reverse proxy vhost s hlavnou aplikáciou.

Frontend kontajner obsahuje custom entrypoint, ktorý pri štarte:
1. Nahradí branding placeholdery v JS/HTML súboroch hodnotami z environment premenných (runtime substitúcia)
2. Podľa `SSL_MODE` vyberie nginx konfiguráciu:
- `nginx-http.conf` — HTTP only (port 80), pre režim za externým proxy
- `nginx-ssl.conf` — HTTPS (port 443) s TLS 1.2+, HSTS, HTTP→HTTPS redirect

## E2E Šifrovanie

### Princíp

1. Prehliadač uploadera **generuje AES-256-GCM kľúč**
2. Súbory sa **šifrujú po chunkoch (5 MB)** priamo v prehliadači
3. Názvy súborov sa tiež šifrujú tým istým kľúčom
4. Šifrované chunky sa odosielajú na server
5. Server ukladá len šifrované dáta — nemá prístup k obsahu
6. URL pre zdieľanie: `/s/SLUG#ENCRYPTION_KEY`
7. Fragment za `#` sa **nikdy neodosiela na server** (RFC 3986)
8. Príjemca otvorí URL, prehliadač extrahuje kľúč z fragmentu
9. Metadata a chunky sa dešifrujú na strane klienta

### Lokálna obnova odkazu (key vault)

Keďže kľúč žije len v URL fragmente, používateľ, ktorý si odkaz hneď po uploade neskopíruje, ho stratí (v „Moje zdieľania" vidí len `slug`). Preto sa kľúč po uploade ukladá **lokálne v prehliadači** uploadera — `localStorage["sharedrop_share_keys"]` vo formáte `{ [slug]: { key, createdAt } }` (modul `frontend/src/services/keyVault.ts`). Stránka „Moje zdieľania" potom pri zhode `slug` zrekonštruuje plný odkaz a ponúkne tlačidlo *Kopírovať odkaz*.

- **Zero-knowledge ostáva nedotknuté** — kľúč sa naďalej nikdy neposiela na server; pri kompromitácii servera je nedostupný.
- **Vedome neukladáme do cookie** — cookie by sa pri každom requeste automaticky posielalo na server (hlavička `Cookie`), čím by kľúč unikol na server. `localStorage` sa na server nikdy automaticky neposiela.
- **Kompromisy:** obnova funguje len v tom istom prehliadači/zariadení; kľúč je uložený v plaintexte (bez hesla), takže prístup k profilu prehliadača alebo XSS ho odhalí — rovnaký rizikový model ako už existujúci JWT v `localStorage`.

### Chunked Upload/Download

Pre podporu veľkých súborov (až 50 GB) sa používa chunked prístup:

- Súbor sa rozdelí na 5 MB chunky
- Každý chunk sa šifruje samostatne s unikátnym IV (Initialization Vector)
- IV pre každý chunk sa ukladá v databáze
- Pri sťahovaní sa chunky stiahnu a dešifrujú postupne

## Streaming Download

Pre veľké súbory (GB+) je implementovaný streaming download, ktorý predchádza vyčerpaniu RAM:

| Metóda | Prehliadač | Princíp |
|--------|-----------|---------|
| File System Access API | Chrome, Edge | `showSaveFilePicker` → dešifrované chunky sa zapisujú priamo na disk cez `WritableStream` |
| Blob fallback | Firefox, Safari, ostatné | Chunky sa akumulujú v RAM a stiahnu ako Blob; zobrazí sa upozornenie pri veľkých súboroch |

Streaming download nemá praktický limit na veľkosť súboru — obmedzujúcim faktorom je len voľné miesto na disku.

## Reply Share (spätný upload)

Keď príjemca nahrá súbory späť:

1. Frontend vygeneruje **nový šifrovací kľúč** (nie ten pôvodný)
2. Vytvorí sa **nový share** (`POST /api/shares/:slug/reply`) s `parentShareId` odkazujúcim na pôvodný share
3. Súbory sa zašifrujú novým kľúčom a nahrajú
4. Server pošle e-mail pôvodnému vlastníkovi s kompletným odkazom (vrátane nového kľúča)
5. Reply share má vlastnú expiráciu (`REPLY_SHARE_EXPIRY_DAYS`, default 7 dní)

Platnosti zdieľaní na výber v UI sa konfigurujú cez `SHARE_EXPIRY_OPTIONS_DAYS` (napr. `1,7,14,30,90`). Frontend ich načíta z `GET /api/config`. V Nastaveniach zdieľania je platnosť uvedená ako prvá, možnosť povoliť nahrať protistrane ako druhá.

## Databázový model

- **User** — registrovaní používatelia (email + OTP autentifikácia)
- **OtpCode** — jednorazové overovacie kódy
- **Share** — zdieľanie (slug, platnosť, povolenia, `parentShareId` pre reply shares, `maxDownloads` voliteľný limit stiahnutí, `downloadCount` počet stiahnutí)
- **FileRecord** — metadata o nahranom súbore (šifrovaný názov, veľkosť, počet chunkov)
- **Chunk** — jednotlivé šifrované chunky (IV, veľkosť, cesta na disku)
- **CleanupLog** — záznamy o čistení expirovaných zdieľaní (čas, počet zmazaných, uvoľnené bajty)
- **DailyStats** — denné snapshoty agregovaných štatistík (zdieľania, súbory, používatelia, stiahnutia, úložisko)
- **CronJob** — persistentné konfigurácie cron jobov (rozvrh, stav aktivity)

## Autentifikácia

- OTP (One-Time Password) cez e-mail
- JWT token po úspešnom overení
- Whitelist e-mailových domén (konfigurovateľný cez `ALLOWED_EMAIL_DOMAINS`)
- Rate limiting na OTP endpoint (5 pokusov / 15 min)

## Odosielanie e-mailov

Režim odosielania sa nastavuje cez premennú `SMTP_MODE`. Adresa odosielateľa `SMTP_FROM` sa používa v režimoch `smtp` aj `oauth2`.

**Jazyky e-mailov:** OTP a notifikácia o reply sú podporované v `en`, `cs`, `sk`, `uk`. Frontend posiela `locale` podľa jazyka UI (z `i18n.language` resp. `localStorage.i18nextLng` ako záloha pri OTP); pre ostatné jazyky sa použije angličtina. Backend preklady: `backend/src/locales/email.ts`.

| Režim | Popis | Kedy použiť |
|-------|-------|-------------|
| `none` | OTP kódy sa len logujú do konzoly | Vývoj, testovanie |
| `smtp` | Klasický SMTP s user/password | Vlastný SMTP server, Gmail atď. |
| `oauth2` | Exchange Online cez OAuth2 (XOAUTH2) | Microsoft 365 / Exchange Online |

**Klasický SMTP** — pri pripojení na interný SMTP server cez IP adresu (napr. `10.0.0.1`) môže certifikát servera platiť len pre DNS meno (`*.example.com`). Overenie TLS certifikátu potom zlyhá (`IP: 10.0.0.1 is not in the cert's list`). V takomto prípade nastavte `SMTP_TLS_REJECT_UNAUTHORIZED=false` v `.env`. Pri použití hostname namiesto IP ponechajte default `true`.

Pre režim `oauth2` je potrebná registrácia aplikácie v Azure Entra ID.
Kompletný návod: [EXCHANGE_OAUTH2_SETUP.md](EXCHANGE_OAUTH2_SETUP.md)

## Internacionalizácia (i18n)

Aplikácia podporuje 22 európskych jazykov:

- **Autodetekcia** — `i18next-browser-languagedetector` rozpozná jazyk prehliadača
- **Manuálny výber** — dropdown v navigačnej lište
- **Fallback** — anglický jazyk ako záložný pre nepodporované jazyky
- **Locale súbory** — `frontend/src/locales/{lang}.ts`, každý exportuje kompletný prekladový objekt

Podporované jazyky: EN, SK, CS, DE, FR, ES, IT, PL, PT, NL, HU, RO, UK, HR, BG, SL, SV, DA, FI, EL, TR, NB

## SSL režimy

Premenná `SSL_MODE` v `.env` určuje, kde sa terminuje SSL:

| Režim | Popis |
|-------|-------|
| `external` (default) | Kontajner servíruje len HTTP na porte 80. SSL terminuje externý reverse proxy (Apache, Nginx, Traefik). |
| `docker` | Kontajner servíruje HTTPS na porte 443 s vlastnými certifikátmi. Obsahuje HTTP→HTTPS redirect a HSTS. |

Pre režim `docker` je nutné poskytnúť certifikáty cez `SSL_CERT_PATH` a `SSL_KEY_PATH`.
Kompletný návod: [DEPLOYMENT.md](DEPLOYMENT.md)

## Bezpečnosť

### E2E šifrovanie
- Server nikdy nevidí obsah súborov — šifrovací kľúč je len v URL fragmente (#)
- AES-256-GCM s unikátnym IV pre každý chunk
- Názvy súborov sú tiež šifrované
- Kľúč sa pre obnovu odkazu ukladá len lokálne v prehliadači uploadera (`localStorage`, nie cookie, nie server) — viď *E2E Šifrovanie → Lokálna obnova odkazu*

### Autentifikácia a autorizácia
- **OTP** — jednorazový 6-miestny kód s expiráciou (10 min default)
- **JWT** — HS256 s explicitným algoritmom (prevencia "algorithm confusion" útokov)
- **Expirácia tokenu** — 24h default (konfigurovateľné cez `JWT_EXPIRY`)
- **Admin roly** — `admin` (plné práva) a `viewer` (len čítanie), konfigurácia cez `ADMIN_EMAILS`
- **Runtime warning** — ak `JWT_SECRET === "change_me"` v produkcii, server vypíše varovanie

### Validácia vstupov
- **Middleware `validate.ts`** — centralizované validačné funkcie pre všetky route súbory
- E-mail: regex + max 254 znakov
- Slug: `/^[a-zA-Z0-9_-]{1,64}$/`
- UUID: formát kontrola pre fileId parametre
- OTP: presne 6 číslic
- String vstupy: max dĺžka (encryptedName 1024, shareUrl 2048, search 200, schedule 100 znakov)
- Base64 validácia pre chunk IV hlavičky

### Rate limiting
6 rate limiterov na ochranu proti brute-force a DoS:

| Limiter | Endpoint | Limit | Kľúč | Účel |
|---------|----------|-------|------|------|
| `otpRateLimit` | POST /auth/request-otp | 5 req / 15 min | email alebo IP | OTP spam prevencia |
| `verifyOtpRateLimit` | POST /auth/verify-otp | 10 req / 15 min | email alebo IP | Brute-force ochrana |
| `fileInitRateLimit` | POST /:slug/files/init | 60 req / min | IP | Limit počtu nových súborov |
| `shareCreateRateLimit` | POST /shares | 20 req / min | IP | Mass share creation |
| `adminRateLimit` | /api/admin/* | 300 req / min | admin email (z JWT) alebo IP | Per-admin ochrana SPA endpointov |
| `adminWriteRateLimit` | 4 admin write endpointy *(viď nižšie)* | 30 req / min | admin email (z JWT) alebo IP | Prísna poistka proti hromadným deštruktívnym akciám |

`adminWriteRateLimit` sa aplikuje na: `DELETE /api/admin/shares/:slug`, `PUT /api/admin/cron-jobs/:id`, `POST /api/admin/cron-jobs/:id/run`, `POST /api/admin/cleanup/run`.

Poznámka: chunk endpointy (`POST .../chunks/:idx`, `GET .../chunks/:idx`) **nemajú** per-request rate limit. Pôvodné `uploadRateLimit`/`downloadRateLimit` boli odstránené, lebo pri 5 MB chunkoch každý súbor > ~1 GB narazil na 429. Abuse je krytý cez `fileInitRateLimit`, `shareCreateRateLimit`, `maxFileSizeMb`, validáciu `chunkCount`, `share.maxDownloads` a kontrolu voľného miesta na disku.

**Kľúč rate-limitera:**
- `otp*` — primárne email z requestu (predvídateľný), fallback `getClientIp(req)`.
- `fileInit`, `shareCreate` — IP cez `getClientIp(req)` (vyžaduje korektne nastavený `TRUSTED_PROXIES` + `REAL_IP_HEADER` ak je nasadené za reverse proxy).
- `admin*` — email z JWT (dekódovaný bez verifikácie cez `jwt.decode`; `requireAdmin` overí podpis a rolu neskôr). Vďaka tomu má každý admin používateľ vlastný bucket bez ohľadu na IP — admin SPA nemôže limit minúť pre iného admina. Pri request bez tokenu (alebo malformed) fallback na IP.

### Bezpečnostné hlavičky

**Nginx** (všetky 3 konfigurácie — http, ssl, admin):
- `Content-Security-Policy` — `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'`
- `X-Frame-Options: DENY` — ochrana proti clickjacking
- `X-Content-Type-Options: nosniff` — prevencia MIME sniffing
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — zakázaná geolokácia, mikrofón, kamera
- `HSTS` — len v SSL režime (`max-age=31536000; includeSubDomains`)

**Helmet.js** (Express backend):
- `frameguard: deny`, `referrerPolicy: strict-origin-when-cross-origin`
- CSP vypnuté na API úrovni (riešené cez Nginx)

### Path traversal ochrana
- Funkcia `safePath()` v `storage.ts` — `path.resolve().startsWith()` kontrola
- Všetky prístupy k súborovom systému prechádzajú cez `safePath` (getShareDir, getFileDir, deleteShareDir, deleteFileDir)
- Prevencia proti `../` v shareId alebo fileId parametroch

### XSS ochrana
- React JSX automaticky escapuje HTML entity vo všetkých `{variable}` výrazoch
- Žiadne použitie `dangerouslySetInnerHTML`, `innerHTML`, `eval()` v celej aplikácii
- Bezpečné renderovanie chybových hlášok z API

### CSRF ochrana
- Nie je potrebná samostatná CSRF ochrana — aplikácia používa JWT Bearer tokeny v `Authorization` headeri
- Prehliadač automaticky nepripojí `Authorization` header pri cross-origin requestoch
- Architektonické rozhodnutie: tokeny nie sú uložené v cookies

### Bezpečnostné logovanie
- Služba `securityLog.ts` — štruktúrované logovanie bezpečnostných udalostí
- Logované udalosti: neúspešná autentifikácia (401), zamietnutý admin prístup (403), neplatný OTP, neplatné vstupy, prekročenie rate-limitu
- Formát: `[SECURITY] event_type { timestamp, ip, method, path, details }`
- IP klienta sa rozlišuje cez `utils/clientIp.ts → getClientIp(req)` — helper čerpá z `req.ip` (po Express `trust proxy` a nginx `real_ip` module), normalizuje IPv6-mapped IPv4 (`::ffff:1.2.3.4`) a fallback-uje na socket IP. Rovnaký helper používajú aj všetky rate-limit `keyGenerator`-y, takže log a rate-limit vidia identický kľúč.

### Systémová odolnosť
- **Disk monitoring** — periodická kontrola voľného miesta, konfigurovateľné prahy (15% warn, 5% block)
- **Upload blokovanie** — HTTP 507 ak disk klesne pod kritickú hranicu
- **Admin notifikácie** — e-mail v češtine pri disk warn/critical, cron error, cleanup error, uncaught exception
- **Globálne error handlery** — `uncaughtException` a `unhandledRejection` s admin notifikáciou

## Branding

Aplikácia podporuje konfigurovateľný branding pre nasadenie v rôznych organizáciách:

| Premenná | Kde sa používa | Typ |
|----------|---------------|-----|
| `APP_NAME` | E-maily (subjekty, hlavičky), admin notifikácie | Runtime (backend) |
| `VITE_COMPANY_LOGO_URL` | Logo v hlavičke frontendu | Runtime (frontend) |
| `VITE_COMPANY_NAME` | Title, hlavička, úvodná stránka, päta | Runtime (frontend) |

### Runtime substitúcia

Frontend image sa builduje s placeholdermi (`__VITE_COMPANY_NAME__`, `__VITE_COMPANY_LOGO_URL__`). Docker entrypoint skript pri štarte kontajnera nahradí placeholdery v JS a HTML súboroch skutočnými hodnotami z environment premenných pomocou `sed`. Vďaka tomu je možné meniť branding bez rebuildu image — rovnaký GHCR image funguje pre akúkoľvek organizáciu.

Farebná schéma je definovaná v `frontend/tailwind.config.js` cez `brand` paletu (Tailwind CSS tokeny). Pre zmenu farieb je potrebné aktualizovať paletu a rebuildiť frontend.

Pre nasadenie v inej organizácii:
1. Nastaviť 3 env premenné v `.env`
2. Umiestniť logo do `frontend/public/logo.svg`
3. Voliteľne upraviť farebnú paletu v `tailwind.config.js` (vyžaduje rebuild)
4. `docker compose up -d --force-recreate`

### Ďalšie
- **CORS** — konfigurovateľné povolené originy (`CORS_ORIGIN`)
- **TLS 1.2+** — v Docker SSL režime vynútené moderné šifrovacie protokoly
- **Client IP za reverse proxy** — bundled nginx má cez env premenné (`TRUSTED_PROXIES`, `REAL_IP_HEADER`) zapínateľný `ngx_http_realip_module`, ktorý prepíše `$remote_addr` na skutočnú IP klienta z dôveryhodnej forwarded-IP hlavičky. Express `trust proxy` (`TRUST_PROXY`, default `1`) potom korektne vystaví `req.ip`. Centrálny helper `backend/src/utils/clientIp.ts → getClientIp(req)` používa security log aj všetky rate-limity (`keyGenerator`). `IP_DEBUG=true` zapne diagnostický middleware logujúci všetky relevantné hlavičky. Pozri *docs/DEPLOYMENT.md → Client IP behind a reverse proxy*.
- **Automatický cleanup** — expirované zdieľania sa mažú podľa cron rozvrhu

## Limit stiahnutí

Voliteľné obmedzenie počtu stiahnutí na zdieľanie:

- Pri vytváraní share je možné nastaviť `maxDownloads` (null = neobmedzené)
- Backend kontroluje `downloadCount >= maxDownloads` pri každom pokuse o stiahnutie
- Ak je limit dosiahnutý, server vráti HTTP 410 (Gone)
- `downloadCount` sa inkrementuje pri stiahnutí prvého chunku súboru

## Admin konzola

Samostatná React/Vite aplikácia (`admin/`), ktorá sa builduje v rámci frontend Docker image (multi-stage build) a nginx ju servíruje pod sub-cestou `/admin/` na rovnakom hoste a porte ako hlavnú aplikáciu. Vite `base: "/admin/"` a React Router `basename="/admin"` zabezpečujú správne načítavanie assetov a routovanie.

### Autentifikácia a autorizácia

- Zdieľaný OTP flow s hlavnou aplikáciou (rovnaký backend endpoint)
- Roly: `admin` (plné práva vrátane mazania a editácie cron jobov) a `viewer` (len čítanie)
- Konfigurácia cez env premennú `ADMIN_EMAILS` (formát: `email:role,email:role`)
- Middleware `requireAdmin` (čítanie) a `requireAdminWrite` (zápis/mazanie)

### Funkcie

- **Dashboard** — štatistické karty, timeline graf s prepínačom metriky a obdobia (30d/3m/1r), koláčový graf, top shares
- **Správa zdieľaní** — paginovaný zoznam, filtrovanie, vyhľadávanie, detail, mazanie
- **Systém** — disk usage, cleanup logy, editovateľné cron joby s formulárom

### Centrálny cron registr

Cron joby sú spravované centrálnym registrom (`cronRegistry.ts`):
- Rozvrhy sa ukladajú v tabuľke `cron_jobs` (persistentné medzi reštartmi)
- Editácia cez admin UI: každých N hodín / denne / vlastný cron výraz
- Aktivácia/deaktivácia a manuálne spustenie
- Aktuálne registrované joby: `cleanup` (mazanie expirovaných shares + nedokončených uploadov starších ako 24 h), `daily-stats` (denný snapshot štatistík) a `disk-monitor` (kontrola voľného miesta na disku)
