# FileDrop — Changelog

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
