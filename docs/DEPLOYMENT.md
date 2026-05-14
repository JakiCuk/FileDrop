# FileDrop — Deployment Guide

FileDrop supports two SSL modes controlled by the `SSL_MODE` environment variable in `.env`.

## Verzovanie Docker images

`docker-compose.prod.yml` referencuje image z GHCR cez premennú `FILEDROP_VERSION` z `.env`:

```yaml
image: ghcr.io/jakicuk/filedrop-backend:${FILEDROP_VERSION:-latest}
```

Hodnoty, ktoré môžeš nastaviť do `.env`:

| Hodnota | Význam | Použitie |
|---------|--------|----------|
| `latest` | Vždy najnovší build z `main` | dev / test |
| `1.2`    | Najnovší patch v rade `1.2.x` (auto bug‑fixy, žiadne breaking) | **odporúčané pre produkciu** |
| `1.2.3`  | Presne táto verzia, nikdy iná | striktný rollback / audit |

CI workflow (`.github/workflows/release.yml`) pri každom git tagu `v*` automaticky pushne všetky tri varianty (`1.2.3`, `1.2`, `latest`) do GHCR pre každý z dvoch image (`backend`, `frontend`). Admin SPA je súčasťou frontend image (od v1.1.0).

### Update na novú verziu

```bash
# 1. (voliteľné) zmeniť FILEDROP_VERSION v .env, ak chceš major upgrade
# 2. stiahnuť novú verziu image-ov
docker compose pull
# 3. recreate kontajnerov s novými image
docker compose up -d
```

`docker compose pull` je nutný — bez neho Docker použije lokálne uloženú verziu, aj keď CI medzitým pushol nový build.

### Rollback

Zmeň `FILEDROP_VERSION` v `.env` na konkrétnu staršiu patch verziu (napr. `1.2.3`) a spusti `docker compose pull && docker compose up -d`.

**Pozor:** Ak novšia verzia spustila non‑backward‑compatible Prisma migráciu, samotný image rollback neopraví schému databázy. Pri väčších upgrade‑och vždy najprv overiť v `prisma/migrations/` a `docs/CHANGELOG.md`.

---

## Branding

Aplikácia podporuje konfigurovateľný branding cez `.env`:

```ini
APP_NAME=FileDrop
VITE_COMPANY_LOGO_URL=/logo.svg
VITE_COMPANY_NAME=FileDrop
```

- `APP_NAME` — názov v e-mailoch a admin notifikáciách (runtime, backend)
- `VITE_COMPANY_LOGO_URL` — logo v hlavičke (runtime, frontend)
- `VITE_COMPANY_NAME` — názov vedľa loga, v title, na úvodnej stránke a v päte (runtime, frontend)
- Logo: umiestniť SVG/PNG do `frontend/public/logo.svg`

**Runtime substitúcia:** Frontend Docker image sa builduje s placeholdermi (`__VITE_COMPANY_NAME__`, `__VITE_COMPANY_LOGO_URL__`). Pri štarte kontajnera entrypoint skript automaticky nahradí placeholdery skutočnými hodnotami z environment premenných. Vďaka tomu nie je potrebný rebuild image pri zmene brandingu — stačí zmeniť `.env` a reštartovať kontajner.

Po zmene branding premenných:
```bash
docker compose up -d --force-recreate
```

---

**Poznámka:** Pri zmene `.env` je nutné obnoviť kontajnery (`docker compose up -d --force-recreate`), nie len reštartovať — premenné prostredia sa načítajú len pri vytvorení kontajnera.

---

## Admin konzola

Od v1.1.0 je admin SPA súčasťou frontend Docker image a beží pod sub-cestou **`/admin/`** na rovnakom hoste a porte ako hlavná aplikácia. Nie je potrebný samostatný kontajner ani osobitný vhost v reverse proxy.

### Konfigurácia

Do `.env` pridajte:

```ini
ADMIN_EMAILS=admin@company.com:admin,viewer@company.com:viewer
```

`ADMIN_EMAILS` — čiarkou oddelený zoznam admin e-mailov s rolami:
- `admin` — plné práva (mazanie zdieľaní, editácia cron jobov)
- `viewer` — len čítanie (dashboard, štatistiky)

### Prístup

Admin konzola je dostupná na `https://filedrop.example.com/admin/`. Reverse proxy nepotrebuje žiadnu špeciálnu konfiguráciu — `/admin/` je obyčajná location v rámci jedného vhostu, a `/api/admin/*` chráni `requireAdmin` middleware na backende.

---

## Option 1: Behind an external reverse proxy (`SSL_MODE=external`)

**This is the default.** The Docker container serves HTTP on port 80. Your existing reverse proxy (Apache, Nginx, HAProxy, Traefik, etc.) terminates SSL and forwards traffic.

### .env

```ini
SSL_MODE=external
APP_PORT=8080
```

### Example: Apache reverse proxy

```apache
<VirtualHost *:443>
    ServerName sharedrop.example.com

    SSLEngine on
    SSLCertificateFile    /path/to/cert.pem
    SSLCertificateKeyFile /path/to/key.pem

    ProxyPreserveHost On
    ProxyPass        / http://localhost:8080/
    ProxyPassReverse / http://localhost:8080/

    # Required for large file chunked uploads/downloads
    ProxyTimeout 600
    ProxyBadHeader Ignore
</VirtualHost>
```

Enable required modules:

```bash
a2enmod proxy proxy_http ssl headers
systemctl restart apache2
```

### Example: Nginx reverse proxy

```nginx
server {
    listen 443 ssl;
    server_name sharedrop.example.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Large file support
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        proxy_buffering off;
        proxy_request_buffering off;
        client_max_body_size 6m;
    }
}
```

### Important notes for external proxy

| Setting | Value | Why |
|---------|-------|-----|
| `client_max_body_size` / `LimitRequestBody` | `6m` | Uploads are 5 MB chunks, not full file size |
| `proxy_buffering off` | Required | Prevents proxy from buffering large responses in RAM |
| `proxy_read_timeout` | `600s`+ | Large files need time for chunked transfer |
| `X-Forwarded-For` / `X-Real-IP` | **Set them** | Without these the backend logs the proxy's IP instead of the real client (rate-limits then accumulate across all clients). See *Client IP behind a reverse proxy* below. |
| HTTPS | **Required** | Web Crypto API (encryption) only works over HTTPS or localhost |

---

## Client IP behind a reverse proxy

When FileDrop runs behind an external reverse proxy (`SSL_MODE=external`), the bundled nginx sees connections coming from the proxy, not from the actual client. Without extra configuration the backend will log the proxy's IP (or the docker bridge gateway, e.g. `172.x.x.x`) for every request. Two consequences:

- Admin console *Security → Top IPs* groups every client under one IP.
- IP-based rate limiters (`fileInit`, `shareCreate`, `admin`) share a single bucket across all clients → spurious 429s.

### Configuration

The bundled nginx ships with the `real_ip` module wired through env variables. Set these in `.env`:

| Variable | Default | Purpose |
|---|---|---|
| `TRUSTED_PROXIES` | *(empty — module disabled)* | CSV of CIDRs/IPs of the upstream proxies whose forwarded-IP header to trust. Examples: `10.0.0.0/8`, `172.16.0.0/12,10.0.0.0/8`, `192.0.2.5/32`. |
| `REAL_IP_HEADER` | `X-Forwarded-For` | Header the upstream uses to carry the client IP. Common alternatives: `X-Real-IP`, `CF-Connecting-IP`, `True-Client-IP`. |
| `TRUST_PROXY` | `1` | Express trust-proxy setting (number of trusted hops). `1` is correct after nginx rewrites `$remote_addr`. |
| `IP_DEBUG` | `false` | Diagnostic: when `true`, every `/api/*` request logs a `[IP_DEBUG] {...}` line with all relevant headers + the resolved IP. **Disable in production after diagnosis.** |

When `TRUSTED_PROXIES` is empty, the `real_ip` module stays disabled and behaviour is identical to previous versions.

### Security note

`set_real_ip_from` is what makes header-based client IP safe. Nginx only honours the forwarded-IP header when the request *actually* comes from a CIDR listed in `TRUSTED_PROXIES`. A direct attacker who reaches the bundled nginx from outside that range cannot spoof their IP by setting `X-Forwarded-For` — the header is preserved in logs but `$remote_addr` is not rewritten.

### Diagnostic flow (when you don't know what the upstream proxy sends)

1. Set `IP_DEBUG=true` (leave `TRUSTED_PROXIES` empty initially), `docker compose up -d`.
2. From a known external client IP hit `https://your-domain/api/health` (or any endpoint).
3. Inspect backend logs:
   ```bash
   docker compose logs backend | grep IP_DEBUG | tail -1
   ```
   You will see something like:
   ```json
   [IP_DEBUG] {"path":"/api/health","resolvedIp":"172.18.0.1","headers":{"x-forwarded-for":"203.0.113.5, 10.20.30.40","x-real-ip":"203.0.113.5"}}
   ```
   Find which header holds your real public IP.
4. Alternative: with an admin JWT call `GET /api/admin/debug/ip` and read the JSON snapshot.
5. Configure:
   - `REAL_IP_HEADER=<header name where the real IP lives>` (most often `X-Forwarded-For`).
   - `TRUSTED_PROXIES=<CIDR/IP of the upstream proxy as the bundled nginx sees it>` — usually the docker bridge gateway (`172.16.0.0/12`) when the external proxy runs on the same host, or the LAN IP of the external proxy when it runs on a different machine.
6. `docker compose up -d` and re-test: `resolvedIp` must now match your real client IP.
7. Set `IP_DEBUG=false` and `docker compose up -d backend`.

### What if the upstream proxy doesn't send a client-IP header at all?

You cannot recover the client IP from data the proxy did not pass through. Either configure the upstream to set `X-Forwarded-For` / `X-Real-IP`, or accept that the proxy IP is the best identifier you can have.

---

## Option 2: SSL directly in Docker (`SSL_MODE=docker`)

The container handles SSL itself. No external proxy needed.

### 1. Prepare certificates

Place your SSL certificate and private key in the `certs/` directory:

```
share_app/
  certs/
    cert.pem    # SSL certificate (or fullchain)
    key.pem     # Private key
```

**Self-signed certificate** (for testing only):

```bash
mkdir -p certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/key.pem \
  -out certs/cert.pem \
  -subj "/CN=sharedrop.example.com"
```

**Let's Encrypt** (production):

```bash
certbot certonly --standalone -d sharedrop.example.com
# Then symlink or copy:
cp /etc/letsencrypt/live/sharedrop.example.com/fullchain.pem certs/cert.pem
cp /etc/letsencrypt/live/sharedrop.example.com/privkey.pem certs/key.pem
```

### 2. Configure .env

```ini
SSL_MODE=docker
SSL_CERT_PATH=./certs/cert.pem
SSL_KEY_PATH=./certs/key.pem
APP_PORT=80
APP_SSL_PORT=443
```

### 3. Start

`SSL_MODE=docker` vyžaduje override súbor `docker-compose.ssl.yml`, ktorý pridá cert bind-mounty a port 443:

```bash
docker compose -f docker-compose.yml -f docker-compose.ssl.yml up -d
```

Alebo trvalo cez `.env` (potom stačí obyčajné `docker compose up -d`):

```ini
COMPOSE_FILE=docker-compose.yml:docker-compose.ssl.yml
```

V `SSL_MODE=external` (default) sa override súbor nepoužíva — kontajner servíruje len HTTP na porte 80 / `APP_PORT`, žiadne certifikáty sa nikam nemontujú.

The container will:
- Redirect HTTP (port 80) to HTTPS (port 443)
- Serve the app with your SSL certificate
- Add HSTS security header

### Verifying

```bash
# Check container logs for SSL mode confirmation
docker compose logs frontend | head -5

# Expected output for docker mode:
# [FileDrop] SSL_MODE=docker — using SSL config (port 443)

# Expected output for external mode:
# [FileDrop] SSL_MODE=external — using HTTP config (port 80, SSL terminated by external proxy)
```

---

## Firewall / Network requirements

| Port | Direction | Purpose |
|------|-----------|---------|
| 80   | Inbound   | HTTP (redirect to HTTPS in docker mode) |
| 443  | Inbound   | HTTPS (docker mode) or handled by external proxy |
| 8080 | Inbound   | HTTP (external mode, configurable via `APP_PORT`) |

Admin konzola používa rovnaký port ako frontend (sub-cesta `/admin/`).

---

## Certificate renewal

For `SSL_MODE=docker` with Let's Encrypt, set up a cron job to renew and restart:

```bash
0 3 * * 1 certbot renew --quiet && cp /etc/letsencrypt/live/sharedrop.example.com/fullchain.pem /path/to/share_app/certs/cert.pem && cp /etc/letsencrypt/live/sharedrop.example.com/privkey.pem /path/to/share_app/certs/key.pem && docker compose -f /path/to/share_app/docker-compose.yml restart frontend
```

---

## Bezpečnostná konfigurácia

### Povinné v produkcii

| Premenná | Popis | Dôležitosť |
|----------|-------|------------|
| `JWT_SECRET` | Tajný kľúč pre JWT podpisy. **MUSÍ byť zmenený z defaultu `change_me`!** | KRITICKÁ |
| `CORS_ORIGIN` | Povolené originy. Default `*` (všetky) — v produkcii nastaviť na konkrétnu doménu. | VYSOKÁ |
| `ALLOWED_EMAIL_DOMAINS` | Whitelist povolených e-mailových domén (čiarkami oddelené). | VYSOKÁ |

### Disk monitoring

| Premenná | Default | Popis |
|----------|---------|-------|
| `DISK_WARN_THRESHOLD_PERCENT` | `15` | Pri voľnom mieste pod touto hodnotou (%) sa odošle varovanie adminom |
| `DISK_BLOCK_THRESHOLD_PERCENT` | `5` | Pod touto hodnotou (%) sa zablokujú nové uploady (HTTP 507) |
| `ADMIN_NOTIFY_DEBOUNCE_MINUTES` | `60` | Minimálny interval medzi notifikáciami rovnakého typu |

### Rate limiting

Rate limity sú pevne nastavené v kóde. Pre úpravu je potrebné zmeniť hodnoty v `backend/src/middleware/rateLimit.ts`:

| Limiter | Default | Kľúč | Endpoint |
|---------|---------|------|----------|
| OTP request | 5 / 15 min | email **alebo** IP | POST /api/auth/request-otp |
| OTP verify | 10 / 15 min | email **alebo** IP | POST /api/auth/verify-otp |
| File init | 60 / min | IP | POST /api/shares/:slug/files/init |
| Share creation | 20 / min | IP | POST /api/shares |
| Admin (all) | 300 / min | admin email (z JWT) **alebo** IP | /api/admin/* |
| Admin write | 30 / min | admin email (z JWT) **alebo** IP | DELETE /api/admin/shares/:slug, PUT /api/admin/cron-jobs/:id, POST /api/admin/cron-jobs/:id/run, POST /api/admin/cleanup/run |

**Admin limity kľúčované per-email**: `adminRateLimit` aj `adminWriteRateLimit` extrahujú email z Bearer JWT (bez kryptografickej verifikácie — `requireAdmin`/`requireAdminWrite` ho overia neskôr) a používajú ho ako bucket key. Vďaka tomu má každý admin používateľ vlastný bucket bez ohľadu na IP — bežná navigácia v admin SPA (prepínanie tabov, refetch grafov) sa nikdy nedostane do `300/min` stropu, a zároveň 4 *write* endpointy majú prísnejšiu poistku `30/min`. Pri requestoch bez JWT (alebo s malformed tokenom) limiter fallback-uje na IP.

**Ostatné limity (ne-admin)**: klient je identifikovaný cez `getClientIp(req)` helper, ktorý rešpektuje `trust proxy` aj nginx `real_ip` modul. Per-chunk rate-limity (upload/download chunkov) boli odstránené v 1.2.0 — pre veľké súbory by sa kumulatívne plnili. Ochranu poskytuje `fileInitRateLimit` a `shareCreateRateLimit`. **Pre správne fungovanie IP-based limiterov za reverse proxy je nutné nastaviť `TRUSTED_PROXIES` a `REAL_IP_HEADER` — pozri sekciu *Client IP behind a reverse proxy* vyššie.**

### Bezpečnostné hlavičky

Nginx konfigurácie (http, ssl) obsahujú tieto bezpečnostné hlavičky:
- `Content-Security-Policy` — reštrikcia zdrojov na `'self'`
- `X-Frame-Options: DENY` — ochrana proti clickjacking
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — zakázaná geolokácia, mikrofón, kamera
- `Strict-Transport-Security` — len v SSL režime

### Odporúčania

1. **JWT_SECRET** — použiť dlhý, náhodný reťazec (min. 32 znakov). Server vypíše varovanie ak je nastavený na `change_me` v produkcii.
2. **CORS_ORIGIN** — nastaviť na `https://sharedrop.example.com` (konkrétna doména)
3. **HTTPS** — vždy používať HTTPS (Web Crypto API vyžaduje bezpečný kontext)
4. **package-lock.json** — pridať do repozitára pre reprodukovateľné buildy a `npm audit`
5. **Pravidelný audit** — spúšťať `npm audit` periodicky pre kontrolu známych zraniteľností
