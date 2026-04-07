# FileDrop — Changelog

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
