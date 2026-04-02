# FileDrop — Deployment Guide

FileDrop supports two SSL modes controlled by the `SSL_MODE` environment variable in `.env`.

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

Admin konzola beží ako samostatný Docker kontajner na porte 8084 (konfigurovateľné cez `ADMIN_PORT`).

### Konfigurácia

Do `.env` pridajte:

```ini
ADMIN_EMAILS=admin@company.com:admin,viewer@company.com:viewer
ADMIN_PORT=8084
```

`ADMIN_EMAILS` — čiarkou oddelený zoznam admin e-mailov s rolami:
- `admin` — plné práva (mazanie zdieľaní, editácia cron jobov)
- `viewer` — len čítanie (dashboard, štatistiky)

### Spustenie

Admin kontajner sa spustí automaticky s `docker compose up -d`. Je dostupný na `http://hostname:8084`.

Pre prístup za externým reverse proxy pridajte ďalší location/vhost:

**Apache:**
```apache
<VirtualHost *:443>
    ServerName admin.sharedrop.example.com
    # ... SSL config ...
    ProxyPass        / http://localhost:8084/
    ProxyPassReverse / http://localhost:8084/
</VirtualHost>
```

**Nginx:**
```nginx
server {
    listen 443 ssl;
    server_name admin.sharedrop.example.com;
    # ... SSL config ...
    location / {
        proxy_pass http://localhost:8084;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

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
| HTTPS | **Required** | Web Crypto API (encryption) only works over HTTPS or localhost |

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

```bash
docker compose up -d --build
```

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
| 8084 | Inbound   | Admin konzola (konfigurovateľné cez ADMIN_PORT) |

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

| Limiter | Default | Endpoint |
|---------|---------|----------|
| OTP request | 5 / 15 min | POST /api/auth/request-otp |
| OTP verify | 10 / 15 min | POST /api/auth/verify-otp |
| Upload chunks | 200 / min | POST /.../chunks/:index |
| Download chunks | 100 / min | GET /.../chunks/:index |
| Share creation | 20 / min | POST /api/shares |
| Admin | 60 / min | /api/admin/* |

### Bezpečnostné hlavičky

Nginx konfigurácie (http, ssl, admin) obsahujú tieto bezpečnostné hlavičky:
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
