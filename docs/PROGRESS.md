# FileDrop — Progress Log

## 2026-03-05 — Iniciálna implementácia

### Fáza 1: Inicializácia (DONE)
- [x] Docker Compose (PostgreSQL, backend, frontend/nginx)
- [x] Prisma schema s migráciou (User, OtpCode, Share, FileRecord, Chunk)
- [x] Express server s health endpointom
- [x] Nginx reverse proxy (API + static frontend)
- [x] Projektová štruktúra podľa plánu

### Fáza 2: Autentifikácia (DONE)
- [x] OTP generovanie (6-miestny kód, crypto.randomInt)
- [x] Nodemailer SMTP integrácia (fallback na console log ak SMTP nie je konfigurovaný)
- [x] JWT middleware (requireAuth, optionalAuth)
- [x] E-mailová doména whitelist (ALLOWED_EMAIL_DOMAINS)
- [x] Rate limiting na OTP endpoint (5 pokusov / 15 min)

### Fáza 3: Upload + E2E šifrovanie (DONE)
- [x] Web Crypto API (AES-256-GCM) — generovanie kľúča, šifrovanie/dešifrovanie chunkov
- [x] Chunked upload (5 MB chunky) s progress tracking
- [x] File init/chunk/complete API endpointy
- [x] Ukladanie šifrovaných chunkov na lokálny filesystem
- [x] Šifrovanie názvov súborov

### Fáza 4: Download + Zdieľanie (DONE)
- [x] Share slug generovanie (12 znakov, URL-safe)
- [x] Šifrovací kľúč v URL fragmente (#)
- [x] Zoznam súborov s dešifrovanými názvami
- [x] Chunked download s dešifrovaním
- [x] Recipient upload (obojsmerné zdieľanie)
- [x] Trigger download cez URL.createObjectURL

### Fáza 5: UI/UX + Dokončenie (DONE)
- [x] Drag & drop zona pre súbory
- [x] Progress bary (per-file + celkový)
- [x] Responsívny dizajn (Tailwind CSS)
- [x] OTP input s paste podporou
- [x] CRON cleanup expirovaných zdieľaní (každých 6 hodín)
- [x] Dokumentácia (ARCHITECTURE.md, API.md, PROGRESS.md, CHANGELOG.md)
- [x] Layout s navigáciou (prihlásenie, odhlásenie, moje zdieľania)
- [x] Stránka "Moje zdieľania" s možnosťou mazania

## 2026-03-05 — Exchange Online OAuth2

### E-mail: podpora troch režimov (DONE)
- [x] Nová env premenná `SMTP_MODE` (`none` / `smtp` / `oauth2`)
- [x] Klasický SMTP (user/pass) — spätná kompatibilita
- [x] `SMTP_TLS_REJECT_UNAUTHORIZED` — voliteľné vypnutie TLS overovania pri pripojení cez IP na server s DNS certifikátom
- [x] Exchange Online OAuth2 cez `@azure/msal-node` (Client Credentials flow + XOAUTH2)
- [x] Fallback na console log (režim `none`)
- [x] Dokumentácia: `docs/EXCHANGE_OAUTH2_SETUP.md` — krok-za-krokom návod na registráciu Azure AD app
- [x] Aktualizácia `.env.example`, `docker-compose.yml`, `config.ts`

## 2026-03-05 — Reply Share (notifikácia vlastníka)

### Reply Share — upload späť s novým kľúčom (DONE)
- [x] Nový stĺpec `parent_share_id` v tabuľke `shares` (Prisma migrácia)
- [x] Konfigurovateľná expirácia reply share (`REPLY_SHARE_EXPIRY_DAYS`, default 7 dní)
- [x] Konfigurovateľné možnosti platnosti v UI (`SHARE_EXPIRY_OPTIONS_DAYS`, `GET /api/config`)
- [x] Backend `env_file: .env` — spoľahlivé načítanie premenných
- [x] UI: platnosť ako prvé nastavenie, povolenie nahrať protistrane ako druhé
- [x] Viacjazyčné e-maily (en, cs, sk, uk) — OTP a reply notifikácia, locale z frontendu
- [x] `backend/src/locales/email.ts` — preklady e-mailov; OTP fallback na localStorage pri určovaní jazyka
- [x] Endpoint `POST /api/shares/:slug/reply` — vytvorí nový reply share bez autentifikácie
- [x] Endpoint `POST /api/shares/:slug/notify-owner` — odošle e-mail vlastníkovi s odkazom
- [x] Nová e-mailová šablóna `sendReplyNotification` (HTML + text)
- [x] Frontend: príjemca nahrá súbory → nový šifrovací kľúč → nový share → notifikácia vlastníka
- [x] Frontend: stránka "Moje zdieľania" zobrazuje reply shares s tagom "odpoveď príjemcu"
- [x] Úspešná hláška po uploade: "Vlastník bol notifikovaný e-mailom"

## 2026-03-05 — Internacionalizácia (i18n)

### Podpora 22 európskych jazykov (DONE)
- [x] Integrácia `i18next`, `react-i18next`, `i18next-browser-languagedetector`
- [x] Konfigurácia v `frontend/src/i18n.ts` — autodetekcia jazyka, EN fallback
- [x] 22 locale súborov v `frontend/src/locales/` (EN, SK, CS, DE, FR, ES, IT, PL, PT, NL, HU, RO, UK, HR, BG, SL, SV, DA, FI, EL, TR, NB)
- [x] Všetky stránky a komponenty používajú `useTranslation()` hook
- [x] Language selector dropdown v Layout komponente
- [x] Stránka "Moje zdieľania" — odstránené tlačidlo "Kopírovať", zostáva len "Zmazať"

## 2026-03-05 — Streaming download a podpora veľkých súborov

### Streaming download (DONE)
- [x] `downloadFileStreaming` — File System Access API (`showSaveFilePicker`) pre Chrome/Edge
- [x] Dešifrované chunky sa zapisujú priamo na disk cez `WritableStream` (žiadna RAM akumulácia)
- [x] Blob fallback pre Firefox a ostatné prehliadače s upozornením na veľkosť
- [x] `supportsStreamingDownload()` — detekcia podpory v prehliadači
- [x] Kľúč `share.largeFileWarning` v 22 locale súboroch
- [x] TypeScript deklarácie pre File System Access API (`vite-env.d.ts`)

### Backend — async I/O a limity (DONE)
- [x] `fs.writeFileSync` → `fsp.writeFile` (async zápis chunkov)
- [x] `fs.unlinkSync` → `fsp.unlink` (async mazanie chunkov)
- [x] `MAX_FILE_SIZE_MB` default zvýšený na 51200 (50 GB)

## 2026-03-05 — Nginx optimalizácie a konfigurovateľný SSL

### Nginx — timeouty a buffering (DONE)
- [x] `proxy_read_timeout`, `proxy_connect_timeout`, `proxy_send_timeout` = 600 s
- [x] `client_max_body_size` = 10 MB (chunk upload)
- [x] `proxy_buffering off` — streaming response
- [x] `send_timeout` = 600 s

### Konfigurovateľný SSL režim (DONE)
- [x] Env premenná `SSL_MODE` (`external` / `docker`)
- [x] `nginx-http.conf` — HTTP-only config (port 80, za externým proxy)
- [x] `nginx-ssl.conf` — SSL config (port 443, TLS 1.2+, HSTS)
- [x] Custom entrypoint v `frontend/Dockerfile` — výber configu podľa `SSL_MODE`
- [x] Placeholder `nginx/no-cert.pem` pre Docker Compose volume mount
- [x] `APP_SSL_PORT` default 8443 (predchádza konfliktu s existujúcimi službami)
- [x] Dokumentácia: `docs/DEPLOYMENT.md` — návod na nasadenie s Apache/Nginx reverse proxy

## 2026-03-16 — E-mail notifikácia v jazyku vlastníka

### Owner locale pri notifikácii (DONE)
- [x] Nový stĺpec `owner_locale` v tabuľke `shares` (Prisma migrácia `20240103000000_owner_locale`)
- [x] Pri vytváraní share (`POST /api/shares`) uložiť `owner_locale` z frontendu vlastníka
- [x] Pri `notify-owner` používať jazyk z rodičovského share (`owner_locale`), nie z požiadavky príjemcu
- [x] Fallback na locale príjemcu pre zdieľania vytvorené pred migráciou (spätná kompatibilita)
- [x] Cieľ: Vlastník (čeština) dostane e-mail v češtine aj keď príjemca (ukrajinčina) má UI v ukrajinčine

## 2026-03-16 — Admin konzola

### Admin konzola — monitorovanie a správa (DONE)
- [x] Samostatná React/Vite aplikácia v `admin/` so samostatným Docker kontajnerom (port 8084)
- [x] Autentifikácia cez zdieľaný OTP flow s hlavnou aplikáciou
- [x] Roly: `admin` (plné práva vrátane mazania) a `viewer` (len čítanie)
- [x] Konfigurácia adminov cez env premennú `ADMIN_EMAILS` (formát `email:role,email:role`)
- [x] Middleware `requireAdmin` a `requireAdminWrite` pre kontrolu prístupu
- [x] Admin UI: Tailwind CSS, tmavý dizajn, sidebar navigácia, prepínač jazykov (EN, CS, SK)

### Dashboard (DONE)
- [x] Štatistické karty: celkové zdieľania, aktívne zdieľania, súbory, používatelia, stiahnutia
- [x] Timeline graf (Recharts) s prepínačom metriky (vytvorené zdieľania, aktívne, súbory, používatelia, stiahnutia, úložisko)
- [x] Prepínač časového rozsahu: 30 dní / 3 mesiace / 1 rok
- [x] Koláčový graf aktívne vs. expirované zdieľania
- [x] Stĺpcový graf top 10 zdieľaní podľa veľkosti
- [x] Prehľad disku a posledného cleanup jobu

### Správa zdieľaní (DONE)
- [x] Stránkovaný zoznam všetkých zdieľaní s filtrom (aktívne/expirované), vyhľadávaním a radením
- [x] Detailná stránka zdieľania: info, zoznam súborov, reply shares
- [x] Rodičovské zdieľanie zobrazené ako klikateľný slug (nie UUID)
- [x] Mazanie zdieľaní (len admin rola)

### Systémová stránka (DONE)
- [x] Prehľad disku: upload adresár, celková/voľná kapacita, progress bar
- [x] Cleanup logy s paginovanou tabuľkou
- [x] Zobrazenie všetkých cron jobov s popisom, rozpisom a ďalším spustením
- [x] Editácia cron rozpisov cez formulár (každých N hodín / denne / vlastný cron výraz)
- [x] Aktivácia/deaktivácia cron jobov
- [x] Manuálne spustenie ľubovoľného cron jobu

## 2026-03-16 — Limit stiahnutí

### Max downloads na zdieľanie (DONE)
- [x] Nové pole `maxDownloads` (Int?, nullable) v Prisma schéme Share modelu
- [x] `POST /api/shares` akceptuje `maxDownloads` parameter
- [x] Backend kontrola: download endpoint odmietne sťahovanie ak `downloadCount >= maxDownloads`
- [x] Backend kontrola: `GET /api/shares/:slug` vráti 410 ak je limit dosiahnutý
- [x] Upload stránka: number input medzi platnosťou a povolením nahrávania
  - Prázdne = "Neobmedzené" (tlačidlo), kliknutím sa aktivuje input s min. hodnota 1
  - Šípky hore/dole, vymazanie alebo 0 → návrat na "Neobmedzené"
  - Krížik na zrušenie limitu
- [x] Share view stránka: zobrazenie "Stiahnutia: X/Y" pri zdieľaniach s limitom
- [x] Moje zdieľania: zobrazenie počítadla stiahnutí pri limitovaných zdieľaniach
- [x] Prekladové kľúče v 22 jazykoch (`maxDownloadsLabel`, `unlimited`, `downloadsRemaining`, `downloadLimitReached`, `myShares.downloads`)

## 2026-03-16 — Historické štatistiky (Daily Stats)

### Denné snapshoty štatistík (DONE)
- [x] Nový Prisma model `DailyStats` s poľami: `sharesCreated`, `sharesActive`, `totalFiles`, `totalStorageBytes`, `totalUsers`, `totalDownloads`
- [x] Migrácia `20240105000000_daily_stats` — tabuľka `daily_stats` s unikátnym dátumom
- [x] Cron job `daily-stats` (denne o 00:05) — ukladá agregovaný snapshot aktuálneho stavu
- [x] Upsert logika — viaceré reštarty za deň prepíšu posledný stav
- [x] Pri štarte backendu okamžitý backfill dnešného snapshotu
- [x] Retencia 365 dní — staršie záznamy sa automaticky mažú
- [x] Admin API timeline endpoint číta z `DailyStats` s parametrami `days` a `metric`
- [x] Vyplňovanie medzier: dni bez záznamu dedia poslednú hodnotu (kumulatívne metriky) alebo 0 (denné metriky)

### Centrálny cron registr (DONE)
- [x] Nový Prisma model `CronJob` s poľami: `id`, `name`, `description`, `schedule`, `enabled`
- [x] Migrácia `20240106000000_cron_jobs` — tabuľka `cron_jobs`
- [x] `cronRegistry.ts` — centrálny registr: registrácia, init z DB, seed defaults, update, run now
- [x] Cleanup a DailyStats joby refaktorované na registráciu cez `cronRegistry.register()`
- [x] Admin API endpointy: `PUT /api/admin/cron-jobs/:id` (úprava), `POST /api/admin/cron-jobs/:id/run` (manuálne spustenie)
- [x] Retencia cleanup logov: automatické mazanie záznamov starších ako 90 dní

## 2026-03-17 — Systémová odolnosť a monitoring

### Disk monitoring a threshold alerty (DONE)
- [x] `diskMonitor.ts` — služba na kontrolu voľného miesta s cachovaním (TTL 30s)
- [x] Konfigurovateľné prahy: `DISK_WARN_THRESHOLD_PERCENT` (default 15%), `DISK_BLOCK_THRESHOLD_PERCENT` (default 5%)
- [x] Cron job `disk-monitor` (každých 6 hodín) — periodická kontrola a notifikácia adminov
- [x] Blokovanie uploadov pri kritickom stave disku (HTTP 507 Insufficient Storage)
- [x] Frontend zobrazenie užívateľsky prívetivej hlášky pri plnom disku (`upload.diskFull` v 22 jazykoch)

### E-mailové notifikácie pre adminov (DONE)
- [x] `adminNotify.ts` — služba na odosielanie debounced e-mailov adminom v češtine
- [x] 5 typov udalostí: `disk_warn`, `disk_critical`, `cron_error`, `cleanup_error`, `uncaught_error`
- [x] Debouncing per typ udalosti (`ADMIN_NOTIFY_DEBOUNCE_MINUTES`, default 60 min)
- [x] Export `getTransporter()` z `email.ts` pre zdieľanie SMTP transportu

### Globálne spracovanie chýb (DONE)
- [x] `uncaughtException` a `unhandledRejection` handlery s admin notifikáciou
- [x] Express catch-all error middleware
- [x] Integrácia admin notifikácií do `cronRegistry.ts` a `cleanup.ts`

### Rozšírený health check (DONE)
- [x] `/api/health` — kontrola DB konektivity (`SELECT 1`) + stav disku
- [x] Vrátenie `status: "ok" | "degraded"` s detailnými check výsledkami

## 2026-03-17 — Bezpečnostný audit

### Validácia a sanitizácia vstupov (DONE)
- [x] Nový middleware `validate.ts` — pomocné funkcie: `isValidEmail`, `isValidSlug`, `isValidUuid`, `isValidOtp`, `isValidBase64`, `isValidLocale`, `sanitizeString`, `isPositiveInt`
- [x] `auth.ts` route — email regex + max 254 znakov, OTP presne 6 číslic, locale max 10 znakov
- [x] `shares.ts` route — slug validácia (`/^[a-zA-Z0-9_-]{1,64}$/`), locale, shareUrl max 2048 znakov
- [x] `files.ts` route — UUID validácia fileId, encryptedName max 1024 znakov, IV base64 max 64 znakov, chunkCount horný limit
- [x] `admin.ts` route — search max 200 znakov, schedule max 100 znakov, slug validácia

### Rate limiting rozšírenie (DONE)
- [x] `verifyOtpRateLimit` — 10 pokusov / 15 min per email (brute-force ochrana)
- [x] `downloadRateLimit` — 100 req/min per IP (prevencia DoS na download)
- [x] `shareCreateRateLimit` — 20 req/min per IP (prevencia mass share creation)
- [x] `adminRateLimit` — 60 req/min per IP (ochrana admin endpointov)
- [x] Celkovo 6 rate limiterov: OTP request, OTP verify, upload, download, share create, admin

### Path traversal obrana (DONE)
- [x] Funkcia `safePath()` v `storage.ts` — `path.resolve().startsWith()` kontrola
- [x] Aplikovaná na `getShareDir`, `getFileDir`, `deleteShareDir`
- [x] Ochrana proti `../` v shareId alebo fileId parametroch

### JWT hardening (DONE)
- [x] Explicitný `algorithms: ["HS256"]` vo všetkých `jwt.verify()` volaniach (3 middleware funkcie)
- [x] Prevencia "algorithm none" a "algorithm confusion" útokov
- [x] Runtime warning ak `JWT_SECRET === "change_me"` v produkcii

### Bezpečnostné hlavičky — Nginx (DONE)
- [x] `Content-Security-Policy` — `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'`
- [x] `X-Frame-Options: DENY` — ochrana proti clickjacking
- [x] `X-Content-Type-Options: nosniff` — prevencia MIME sniffing
- [x] `Referrer-Policy: strict-origin-when-cross-origin`
- [x] `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- [x] Aplikované na všetky 3 Nginx konfigurácie (http, ssl, admin)

### Helmet.js konfigurácia (DONE)
- [x] Vlastná konfigurácia namiesto defaultov — `frameguard: deny`, `referrerPolicy: strict-origin-when-cross-origin`
- [x] CSP vypnuté na backend úrovni (riešené cez Nginx pre statické súbory)
- [x] `crossOriginEmbedderPolicy: false` (kvôli chunk downloadom)

### XSS ochrana — audit (DONE)
- [x] React JSX escaping na všetkých miestach — žiadne `dangerouslySetInnerHTML`, `innerHTML`, `eval()`
- [x] Všetky užívateľské dáta (slug, email, názvy súborov, error hlášky) renderované cez `{variable}` v JSX
- [x] Bezpečné: React automaticky escapuje HTML entity

### CSRF ochrana — audit (DONE)
- [x] JWT Bearer tokeny v `Authorization` headeri (nie cookies) — CSRF útok nie je možný
- [x] Prehliadač automaticky nepripojí `Authorization` header pri cross-origin requestoch
- [x] Architektonické rozhodnutie zdokumentované v ARCHITECTURE.md

### Bezpečnostné logovanie (DONE)
- [x] Nová služba `securityLog.ts` — štruktúrované logovanie s IP, method, path, timestamp
- [x] Logovanie neúspešných autentifikácií (401) v `requireAuth` middleware
- [x] Logovanie zamietnutých admin prístupov (403) v `requireAdmin` a `requireAdminWrite`
- [x] Logovanie neúspešných OTP overení v `verify-otp` endpoint
- [x] Logovanie neplatných vstupov

### Audit závislostí (ODPORÚČANIE)
- [x] Projekt nepoužíva `package-lock.json` v repozitári (generuje sa pri Docker build)
- [x] Odporúčanie: pridať `package-lock.json` do repozitára a pravidelne spúšťať `npm audit`

## 2026-03-17 — Admin konzola: Záložka Bezpečnosť

### Perzistentné logovanie bezpečnostných udalostí (DONE)
- [x] Nový Prisma model `SecurityEvent` — ukladanie udalostí do PostgreSQL (`security_events` tabuľka)
- [x] Migrácia `20240107000000_security_events` s indexmi na `created_at` a `event`
- [x] `securityLog.ts` rozšírené o fire-and-forget DB write (console log + DB súčasne)
- [x] Všetky rate limitery rozšírené o `handler` callback volajúci `logSecurityEvent("rate_limited", ...)`
- [x] Retencia: `dailyStats.ts` cron mazá `SecurityEvent` záznamy staršie ako 30 dní

### Nové admin API endpointy (DONE)
- [x] `GET /api/admin/security/status` — stav bezpečnostných ochran vrátane sily JWT secretu
- [x] `GET /api/admin/security/stats` — agregované štatistiky (byType 24h/7d/30d, top IPs, denné počty)
- [x] `GET /api/admin/security/events` — paginovaný zoznam udalostí s filtrom (event, IP, days)
- [x] Funkcia `checkJwtSecretStrength()` — hodnotenie JWT secretu: prázdny, placeholder, dĺžka (<32 error / 32–47 warn), zakázané domény, znakový mix, rôznorodosť znakov → výstup `{ level: "ok"|"warn"|"error", reasons[], length }`

### Admin UI — Záložka Bezpečnosť (DONE)
- [x] `SecurityPage.tsx` — nová stránka s plnou funkcionalitou
  - Varovný banner (zelený/žltý/červený) podľa stavu JWT, SMTP, disk monitor, admin notify
  - Grid kariet ochrán (10 stavových kariet + špeciálna karta pre JWT secret s úrovňou a dôvodmi)
  - 4 štatistické karty: celkové udalosti, neúspešné prihlásenia, rate limit hity, neplatné vstupy (za 24h)
  - Časová os (Recharts AreaChart) s prepínačom 7d/30d — denné počty všetkých typov udalostí
  - Tabuľka top 10 IP adries
  - Paginovaná tabuľka udalostí s filtrom (typ, IP, časové obdobie 1d/7d/30d) a farebnými badge
- [x] Pridaná route `/security` do `App.tsx` a položka do `Sidebar.tsx` s ikonou štítu
- [x] Preklady pre záložku Bezpečnosť — EN, CS, SK (≈ 60 nových kľúčov vrátane `jwtReason.*`)
- [x] Oprava timezone problému v `buildTimeline()` — UTC-based generovanie dátumov pre zhodu s PostgreSQL `DATE()`

### Oprava Docker build cache problému (DONE)
- [x] Identifikovaný problém: `docker compose build` používal cached vrstvu pre `COPY src ./src` aj po zmenách
- [x] Riešenie: `docker compose build --no-cache backend` garantuje čerstvú TypeScript kompiláciu
- [x] Príznak problému: `checkJwtSecretStrength` chýbalo v `dist/routes/admin.js` → frontend dostal iba staré `jwtSecretSafe: boolean` bez objektu `jwtSecret` → JWT karta zobrazovala „Dĺžka: 0, Dôvody: –"
- [x] Preventívne odporúčanie: pri zmenách v `src/` vždy overif pomocou `docker exec ... grep -c "funkcia" /app/dist/...`

## 2026-03-18 — Admin Security: Klikateľné detail modály

### Rozšírenie záložky Bezpečnosť (DONE)
- [x] Klikateľné status karty s detail modálom (konfiguračné hodnoty, odporúčania, info záložky)
- [x] Backend: reálna verifikácia pre security logging, CORS, email domain whitelist
- [x] Kategorizácia ochrán: `configurable`, `code_level`, `infrastructure` s vysvetlením
- [x] i18n: 100+ nových prekladových kľúčov pre 12 bezpečnostných ochrán (en/cs/sk)

## 2026-03-19 — Konfigurovateľný branding

### Farebná schéma a logo (DONE)
- [x] Tailwind brand paleta zmenená z modrej na Exploratory Green (#2b6e33)
- [x] Pridaná accent paleta pre Resource Green (#a8be32)
- [x] Favicon (`icon.svg`) aktualizovaný na zelenú
- [x] Meta `theme-color` pridaný do `index.html`
- [x] Všetky `blue-*` Tailwind triedy nahradené na `brand-*`

### Konfigurovateľný branding (DONE)
- [x] `VITE_COMPANY_LOGO_URL` — logo v hlavičke (build-time env)
- [x] `VITE_COMPANY_NAME` — názov na úvodnej stránke, v hlavičke a päte
- [x] `APP_NAME` — názov v e-mailoch a admin notifikáciách
- [x] Frontend Dockerfile: ARG pre VITE premenné, predávané pri `npm run build`
- [x] docker-compose.yml: build args pre frontend, `APP_NAME` pre backend
- [x] `.env.example` doplnený o branding premenné
- [x] E-mailové šablóny: zelené CTA tlačidlá (#2b6e33), Calibri font, `config.appName`
- [x] Admin notifikácie: `config.appName` namiesto hardcoded app name
- [x] E-mail subjects (en/cs/sk/uk): dynamický názov z `config.appName`
- [x] Logo SVG umiestnený v `frontend/public/logo.svg`

### Oprava base64url validácie (DONE)
- [x] Backend regex `BASE64_RE` rozšírený o `-` a `_` pre base64url formát
- [x] Oprava chyby "Invalid X-Chunk-IV header" pri uploade súborov

## 2026-04-02 — Runtime branding a premenovanie na FileDrop

### Runtime branding substitúcia (DONE)
- [x] Frontend Dockerfile: build s placeholdermi (`__VITE_COMPANY_NAME__`, `__VITE_COMPANY_LOGO_URL__`)
- [x] Nový entrypoint skript `docker-entrypoint-filedrop.sh` — `sed` substitúcia placeholderov v JS/HTML súboroch pri štarte kontajnera
- [x] `frontend/index.html` — `<title>` používa placeholder namiesto hardcoded hodnoty
- [x] `docker-compose.prod.yml` a `docker-compose.yml` — `VITE_COMPANY_NAME` a `VITE_COMPANY_LOGO_URL` pridané ako runtime environment premenné pre frontend službu
- [x] Rovnaký GHCR image funguje pre akýkoľvek branding bez rebuildu
- [x] CI/CD pipeline — GitHub Actions workflow (`release.yml`): automatický build Docker images, push na GHCR, GitHub Release so zip balíčkom pri tagu `v*`

### Premenovanie ShareDrop → FileDrop (DONE)
- [x] `admin/index.html` — title "FileDrop Admin"
- [x] `admin/src/locales/{en,cs,sk}.ts` — app.title "FileDrop Admin"
- [x] `frontend/src/components/Layout.tsx` — fallback "FileDrop"
- [x] `frontend/src/pages/HomePage.tsx` — fallback "FileDrop"
- [x] `backend/src/config.ts` — appName fallback "FileDrop"
- [x] `backend/src/index.ts` — log prefix "FileDrop"
- [x] `nginx/docker-entrypoint.sh` — log prefix "[FileDrop]"
- [x] `docker-compose.yml` — defaulty APP_NAME a VITE_COMPANY_NAME "FileDrop"
- [x] `docker-compose.prod.yml` — defaulty APP_NAME a VITE_COMPANY_NAME "FileDrop"
- [x] `.env.example` — defaulty a komentáre "FileDrop"
- [x] `.env` — komentár "FileDrop"

### Aktualizácia dokumentácie (DONE)
- [x] `README.md` — branding tabuľka, runtime poznámka namiesto build-time
- [x] `docs/DEPLOYMENT.md` — runtime substitúcia vysvetlenie, zjednodušený postup po zmene
- [x] `docs/ARCHITECTURE.md` — branding typ "Runtime" namiesto "Build-time", popis entrypoint logiky
- [x] `docs/CHANGELOG.md` — nový záznam v1.0.1
- [x] `docs/PROGRESS.md` — nový záznam

## Next steps (plánované)

### Ďalšie vylepšenia
- [ ] Pridať `package-lock.json` do repozitára pre reprodukovateľné buildy a `npm audit`
- [ ] Implementovať RBAC rozšírenie — granulárnejšie oprávnenia pre admin roly
- [ ] Monitoring výkonu — response time tracking, slow query logging
- [ ] Automatizované testy — unit testy pre validáciu, integračné testy pre API endpointy


## Štruktúra súborov

```
share_app/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   │       ├── 20240101000000_init/
│   │       ├── 20240102000000_reply_share/
│   │       ├── 20240103000000_owner_locale/
│   │       ├── 20240104000000_admin_cleanup_log/
│   │       ├── 20240105000000_daily_stats/
│   │       ├── 20240106000000_cron_jobs/
│   │       └── 20240107000000_security_events/
│   └── src/
│       ├── index.ts
│       ├── config.ts
│       ├── locales/      (email.ts — preklady e-mailov en/cs/sk/uk)
│       ├── routes/       (auth, shares, files, admin)
│       ├── middleware/   (auth, rateLimit, admin, validate)
│       └── services/     (email, storage, cleanup, dailyStats, cronRegistry, diskMonitor, adminNotify, securityLog)
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── i18n.ts
│       ├── vite-env.d.ts
│       ├── locales/      (22 jazykov)
│       ├── pages/        (HomePage, AuthPage, UploadPage, ShareViewPage, MySharesPage)
│       ├── components/   (Layout, FileDropzone, FileList, ProgressBar, OtpInput)
│       ├── services/     (api, crypto, chunkedUpload, chunkedDownload)
│       └── hooks/        (useAuth)
├── admin/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── i18n.ts
│       ├── locales/      (en, cs, sk)
│       ├── pages/        (LoginPage, DashboardPage, SharesPage, ShareDetailPage, SystemPage, SecurityPage)
│       ├── components/   (AdminLayout, Sidebar, StatsCard, DataTable, OtpInput)
│       ├── services/     (api)
│       └── hooks/        (useAdminAuth)
├── nginx/
│   ├── nginx-http.conf
│   ├── nginx-ssl.conf
│   ├── docker-entrypoint.sh
│   └── no-cert.pem
└── docs/
    ├── ARCHITECTURE.md
    ├── API.md
    ├── DEPLOYMENT.md
    ├── EXCHANGE_OAUTH2_SETUP.md
    ├── CHANGELOG.md
    └── PROGRESS.md
```
