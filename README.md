# FileDrop

Webová aplikácia pre dočasné zdieľanie súborov s end-to-end šifrovaním. Súbory sú šifrované priamo v prehliadači — server nikdy nevidí ich obsah. Podporuje konfigurovateľný branding (názov, logo, farby) pre nasadenie v rôznych organizáciách.

## Kľúčové vlastnosti

- **E2E šifrovanie** — AES-256-GCM, šifrovací kľúč nikdy neopustí prehliadač (URL fragment)
- **OTP autentifikácia** — prihlásenie cez jednorazový kód zaslaný na e-mail (e-maily v EN, CS, SK, UK)
- **Whitelist e-mailových domén** — prístup len pre povolené organizácie
- **Obojsmerné zdieľanie** — príjemca môže nahrávať súbory späť (reply share s novým kľúčom)
- **Veľké súbory** — chunked upload/download, streaming zápis na disk (až 50 GB)
- **Limit stiahnutí** — voliteľné obmedzenie počtu stiahnutí na zdieľanie
- **22 jazykov** — automatická detekcia jazyka prehliadača, manuálny výber, EN fallback
- **Automatická expirácia** — zdieľania sa automaticky mažú po uplynutí platnosti
- **Admin konzola** — monitoring, štatistiky, správa zdieľaní, cron joby (port 8084)
- **Disk monitoring** — automatická kontrola voľného miesta, blokovanie uploadov pri plnom disku
- **Bezpečnostné hlavičky** — CSP, HSTS, X-Frame-Options, rate limiting na všetkých endpointoch
- **Konfigurovateľný SSL** — za externým reverse proxy alebo priamo v Docker kontajneri
- **Exchange Online OAuth2** — podpora Microsoft 365 SMTP cez OAuth2
- **Konfigurovateľný branding** — názov aplikácie, logo a farebná schéma cez env premenné

## Podporované jazyky

English, Slovenčina, Čeština, Deutsch, Français, Español, Italiano, Polski, Português, Nederlands, Magyar, Română, Українська, Hrvatski, Български, Slovenščina, Svenska, Dansk, Suomi, Ελληνικά, Türkçe, Norsk

## Rýchly štart

### Predpoklady

- [Docker](https://docs.docker.com/get-docker/) a [Docker Compose](https://docs.docker.com/compose/install/)

### Inštalácia z pre-built images (odporúčané)

1. Stiahnite si zip z [posledného releasu](https://github.com/JakiCuk/FileDrop/releases/latest)
2. Rozbaľte a nakonfigurujte:
   ```bash
   unzip filedrop-*.zip -d filedrop && cd filedrop
   cp .env.example .env
   # Upravte .env podľa potreby
   ```
3. Spustite:
   ```bash
   docker compose up -d
   ```

Images sa automaticky stiahnu z GitHub Container Registry — žiadne buildovanie nie je potrebné.

### Inštalácia zo zdrojového kódu

```bash
# Klonovanie repozitára
git clone https://github.com/JakiCuk/FileDrop.git
cd FileDrop

# Konfigurácia (voliteľné — funguje aj s defaultmi)
cp .env.example .env
# Upravte .env podľa potreby

# Spustenie
docker compose up -d --build

# Aplikácia je dostupná na http://localhost:8080
# Admin konzola na http://localhost:8084
```

### Zastavenie

```bash
docker compose down
```

## Konfigurácia

Všetky nastavenia sú cez environment premenné v `.env` súbore. Pozri [.env.example](.env.example) pre kompletný zoznam.

*Pri zmene `.env` spustite `docker compose up -d --force-recreate` — reštart kontajnera nestačí na načítanie nových premenných.*

### Základné nastavenia

| Premenná | Default | Popis |
|----------|---------|-------|
| `ALLOWED_EMAIL_DOMAINS` | *(prázdne = všetky)* | Whitelist domén, čiarkou oddelené |
| `SMTP_MODE` | `none` | Režim e-mailov: `none` / `smtp` / `oauth2` |
| `SSL_MODE` | `external` | SSL režim: `external` (reverse proxy) / `docker` |
| `SHARE_EXPIRY_OPTIONS_DAYS` | `1,7,14,30,90` | Možnosti platnosti v UI (dni) |
| `MAX_FILE_SIZE_MB` | `51200` | Max. veľkosť súboru (50 GB) |

### Branding

| Premenná | Default | Popis |
|----------|---------|-------|
| `APP_NAME` | `ShareDrop` | Názov aplikácie (e-maily, notifikácie) |
| `VITE_COMPANY_LOGO_URL` | *(prázdne)* | URL loga v hlavičke (napr. `/logo.svg`) |
| `VITE_COMPANY_NAME` | `ShareDrop` | Názov vedľa loga (hlavička, úvodná stránka, päta) |

*Poznámka: `VITE_*` premenné sa aplikujú pri builde frontendu. Po zmene je potrebné `docker compose build frontend`.*

### Bezpečnosť

| Premenná | Default | Popis |
|----------|---------|-------|
| `JWT_SECRET` | `change_me` | **Zmeniť v produkcii!** Tajný kľúč pre JWT tokeny |
| `JWT_EXPIRY` | `24h` | Doba platnosti JWT tokenu |
| `CORS_ORIGIN` | `*` | Povolené originy. V produkcii nastaviť na konkrétnu doménu |

### Admin konzola

| Premenná | Default | Popis |
|----------|---------|-------|
| `ADMIN_EMAILS` | *(prázdne)* | Admini: `email:admin,email:viewer` |
| `ADMIN_PORT` | `8084` | Port admin konzoly |

### Disk monitoring

| Premenná | Default | Popis |
|----------|---------|-------|
| `DISK_WARN_THRESHOLD_PERCENT` | `15` | Varovanie ak voľné miesto klesne pod (%) |
| `DISK_BLOCK_THRESHOLD_PERCENT` | `5` | Blokovanie uploadov pod (%) |
| `ADMIN_NOTIFY_DEBOUNCE_MINUTES` | `60` | Min. interval medzi notifikáciami |

## Tech Stack

| Komponent | Technológia |
|-----------|-------------|
| Backend | Node.js, Express, TypeScript, Prisma |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| Admin konzola | React 18, Vite, TypeScript, Tailwind CSS, Recharts |
| Databáza | PostgreSQL 16 |
| Šifrovanie | Web Crypto API (AES-256-GCM) |
| i18n | i18next, react-i18next |
| Kontajnerizácia | Docker, Docker Compose, Nginx |

## Dokumentácia

| Dokument | Popis |
|----------|-------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architektúra, šifrovanie, bezpečnosť, databázový model |
| [docs/API.md](docs/API.md) | REST API endpointy, rate limity, validácia |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Nasadenie — SSL režimy, reverse proxy, bezpečnostná konfigurácia |
| [docs/EXCHANGE_OAUTH2_SETUP.md](docs/EXCHANGE_OAUTH2_SETUP.md) | Nastavenie Exchange Online OAuth2 |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | História zmien podľa verzií |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Implementačný log |

## Projektová štruktúra

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
│   └── src/
│       ├── index.ts
│       ├── config.ts
│       ├── locales/      (email.ts — preklady e-mailov EN/CS/SK/UK)
│       ├── routes/       (auth, shares, files, admin)
│       ├── middleware/   (auth, rateLimit, admin, validate)
│       ├── services/     (email, storage, cleanup, dailyStats, cronRegistry, diskMonitor, adminNotify, securityLog)
│       └── utils/        (crypto)
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── App.tsx
│       ├── i18n.ts
│       ├── locales/      (22 jazykov)
│       ├── pages/        (Home, Auth, Upload, ShareView, MyShares)
│       ├── components/   (Layout, FileDropzone, FileList, ProgressBar, OtpInput)
│       ├── services/     (api, crypto, chunkedUpload, chunkedDownload)
│       └── hooks/        (useAuth)
├── admin/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── src/
│       ├── App.tsx
│       ├── i18n.ts
│       ├── locales/      (en, cs, sk)
│       ├── pages/        (Login, Dashboard, Shares, ShareDetail, System)
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

## Licencia

[AGPL-3.0](LICENSE)
