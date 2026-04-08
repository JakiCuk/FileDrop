# FileDrop — Changelog

## [1.1.1] - 2026-04-08

### Fixed
- **Header logo zobrazoval broken-image ikonu pri default configu** — `frontend/Dockerfile` buildol SPA s `VITE_COMPANY_LOGO_URL="__VITE_COMPANY_LOGO_URL__"` ako placeholder, ale Vite inlinuje `import.meta.env.VITE_*` ako konštanty pri builde, takže ternárka v `Layout.tsx` sa constant-foldla na `<img>` vetvu a vstavané SVG fallback úplne zmizlo z bundlu. Runtime sed v entrypointe potom nahradil placeholder za prázdny string → `<img src="">` → broken icon vedľa textu "FileDrop". Vedľajším dôsledkom bolo, že **runtime branding cez docker env premenné vôbec nefungoval**, hoci entrypoint to predstieral.

### Changed
- **Branding prepnutý na runtime injection cez `window.__ENV__`** — entrypoint pri štarte kontajnera generuje `/usr/share/nginx/html/env.js` s aktuálnymi hodnotami `VITE_COMPANY_NAME` a `VITE_COMPANY_LOGO_URL`. SPA ich číta z `window.__ENV__` (runtime property access, Vite to neinlinuje). Override branding teraz funguje **bez rebuildu** — stačí zmeniť `.env` a `docker compose up -d`.
- `frontend/Dockerfile`: odstránené `VITE_COMPANY_*` build args z `RUN npm run build`.
- `docker-compose.yml`: odstránený `args:` blok z `frontend.build` (build args už nie sú potrebné, runtime `environment:` ostáva).
- `frontend/docker-entrypoint.sh`: namiesto sed-ovania JS bundle generuje `env.js`; vstupné premenné sa escapujú proti JS-injection.
- `frontend/index.html`: pridaný `<script src="/env.js">` pred `main.tsx`, default `<title>FileDrop</title>`.
- `frontend/public/env.js`: nový dev fallback s prázdnymi hodnotami.

## [1.1.0] - 2026-04-07

### BREAKING
- **Admin konzola zlúčená do frontend kontajnera** — admin SPA sa už nebuilduje ako samostatný Docker image. Beží pod sub-cestou `/admin/` na rovnakom hoste/porte ako hlavná aplikácia (`https://filedrop.example.com/admin/`). Reverse proxy potrebuje len jeden vhost namiesto dvoch.
- **`ADMIN_PORT` premenná zrušená** — admin používa rovnaký port ako frontend (`APP_PORT`, default 8080).
- **Cert bind-mounty cez override súbor** — `docker-compose.yml` v defaulte už nemontuje žiadne certifikáty ani nginx confs. Pri `SSL_MODE=docker` operator pridá `-f docker-compose.ssl.yml` (alebo nastaví `COMPOSE_FILE=docker-compose.yml:docker-compose.ssl.yml` v `.env`).
- **`nginx/` adresár v koreni repa zmazaný** — `nginx-http.conf`, `nginx-ssl.conf`, `docker-entrypoint.sh` a placeholder `no-cert.pem` boli presunuté do `frontend/nginx/` a zabudované priamo do frontend image. Server po novom potrebuje len `docker-compose.yml` + `.env`.

### Migrácia
1. Zastaviť starý stack: `docker compose down`
2. V `.env` zmazať `ADMIN_PORT`, prípadne nastaviť `FILEDROP_VERSION=1.1.0`
3. Stiahnuť nový `docker-compose.yml` (z release zipu alebo repa)
4. Zmazať starý `nginx/` adresár na serveri (už nie je potrebný)
5. V reverse proxy zmazať samostatný admin vhost — admin je dostupný na `/admin/` hlavnej domény
6. Pre `SSL_MODE=docker` pridať override súbor cez `-f docker-compose.ssl.yml` alebo `COMPOSE_FILE` v `.env`
7. `docker compose pull && docker compose up -d`

### Cleanup
- Build matrix v CI workflow: 3 → 2 image (`backend`, `frontend`). Admin tagy v GHCR ostávajú len pre rollback.
- Release zip: obsahuje len `docker-compose.yml`, `docker-compose.ssl.yml` a `.env.example`.

## [1.0.2] - 2026-04-07

### Zmeny
- **`SMTP_FROM_NAME`** — nová voliteľná premenná pre zobrazované meno odosielateľa v mail klientoch. Ak je nastavená, mail `From` má tvar `"FileDrop" <noreply@example.com>`; ak je prázdna, posiela sa len holá adresa (existujúce správanie). Implementované cez `config.smtp.fromFormatted` a aplikované na OTP, reply-share aj admin notifikácie.
- **Verzované Docker tagy** — `docker-compose.prod.yml` referencuje image cez premennú `FILEDROP_VERSION` (default `latest`). Umožňuje pripnúť produkciu na konkrétnu verziu (`1.2`, `1.2.3`) a robiť deterministický rollback. Detaily v `docs/DEPLOYMENT.md`.
- **`.env.example`** — pridaná premenná `FILEDROP_VERSION` s vysvetľujúcim komentárom.

## [1.0.1] - 2026-04-02

### Zmeny
- **Runtime branding** — `VITE_COMPANY_NAME` a `VITE_COMPANY_LOGO_URL` sa aplikujú pri štarte kontajnera (runtime substitúcia), nie pri builde. Umožňuje zmenu brandingu bez rebuildu Docker image.
- **Premenovanie ShareDrop na FileDrop** — všetky hardcoded výskyty "ShareDrop" nahradené na "FileDrop" (admin locale, HTML titulky, backend logy, entrypoint skripty, docker-compose defaulty, .env.example)
- **Frontend Dockerfile** — nový entrypoint skript s `sed` substitúciou placeholderov v JS/HTML súboroch
- **docker-compose.prod.yml** — frontend služba dostáva `VITE_COMPANY_NAME` a `VITE_COMPANY_LOGO_URL` ako runtime environment premenné

## [1.0.0] - 2026-03-31

### Funkcie
- **E2E šifrovanie** — AES-256-GCM, šifrovací kľúč v URL fragmente, server nikdy nevidí obsah
- **OTP autentifikácia** — prihlásenie cez jednorazový kód na e-mail
- **Whitelist e-mailových domén** — prístup len pre povolené organizácie
- **Obojsmerné zdieľanie** — príjemca môže nahrávať súbory späť (reply share s novým kľúčom)
- **Veľké súbory** — chunked upload/download, streaming zápis na disk (až 50 GB)
- **Streaming download** — File System Access API (Chrome/Edge), Blob fallback (Firefox/Safari)
- **Limit stiahnutí** — voliteľné obmedzenie počtu stiahnutí na zdieľanie
- **22 jazykov** — automatická detekcia jazyka prehliadača, manuálny výber, EN fallback
- **Viacjazyčné e-maily** — OTP a notifikácie v en/cs/sk/uk
- **Automatická expirácia** — konfigurovateľné možnosti platnosti, automatický cleanup
- **Admin konzola** — dashboard, štatistiky, správa zdieľaní, cron joby, bezpečnostný prehľad
- **Disk monitoring** — automatická kontrola voľného miesta, blokovanie uploadov pri plnom disku
- **Bezpečnostné hlavičky** — CSP, HSTS, X-Frame-Options, rate limiting na všetkých endpointoch
- **Konfigurovateľný SSL** — za externým reverse proxy alebo priamo v Docker kontajneri
- **Exchange Online OAuth2** — podpora Microsoft 365 SMTP cez OAuth2
- **Konfigurovateľný branding** — názov, logo a farebná schéma cez env premenné
- **Bezpečnostné logovanie** — perzistentné ukladanie bezpečnostných udalostí do DB
- **Validácia vstupov** — centralizovaný middleware pre všetky API endpointy
- **Path traversal ochrana** — safePath() funkcia pre všetky prístupy k súborovému systému
- **Systémová odolnosť** — globálne error handlery, admin notifikácie, disk monitoring
- **Historické štatistiky** — denné snapshoty agregovaných metrík
- **Centrálny cron registr** — persistentné rozvrhy v DB, editácia cez admin UI
