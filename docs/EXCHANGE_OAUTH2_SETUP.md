# Exchange Online OAuth2 - Nastavenie

Tento dokument popisuje kroky potrebné pre konfiguráciu odosielania e-mailov cez Exchange Online (Microsoft 365) s OAuth2 autentifikáciou.

---

## Predpoklady

- Prístup k Azure portálu (https://entra.microsoft.com) s právami **Global Administrator** alebo **Application Administrator**
- Mailbox v Exchange Online, z ktorého sa budú odosielať OTP e-maily (napr. `noreply@example.com`)
- Prístup k Exchange Admin Center (https://admin.exchange.microsoft.com)

---

## Krok 1: Registrácia aplikácie v Azure Entra ID

1. Otvorte [Azure Entra ID - App registrations](https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Kliknite **New registration**
3. Vyplňte:
   - **Name**: `FileDrop Mailer`
   - **Supported account types**: `Accounts in this organizational directory only (Single tenant)`
   - **Redirect URI**: nechajte prázdne (nie je potrebné pre client credentials flow)
4. Kliknite **Register**

### Výstup

Zaznamenajte si z prehľadu aplikácie:

| Hodnota | Kde ju nájdete |
|---------|---------------|
| **Application (client) ID** | Overview stránka aplikácie |
| **Directory (tenant) ID** | Overview stránka aplikácie |

---

## Krok 2: Vytvorenie Client Secret

1. V registrovanej aplikácii prejdite na **Certificates & secrets**
2. Kliknite **New client secret**
3. Vyplňte:
   - **Description**: `FileDrop SMTP`
   - **Expires**: vyberte podľa vašej politiky (napr. 24 mesiacov)
4. Kliknite **Add**
5. **Ihneď skopírujte hodnotu secretu** (po opustení stránky ju už neuvidíte)

| Hodnota | Kde ju nájdete |
|---------|---------------|
| **Client Secret Value** | Stĺpec "Value" v zozname secrets |

---

## Krok 3: Nastavenie API oprávnení

### Variant A: SMTP s OAuth2 (odporúčaný pre tento projekt)

1. V aplikácii prejdite na **API permissions**
2. Kliknite **Add a permission**
3. Vyberte **APIs my organization uses**
4. Vyhľadajte **Office 365 Exchange Online** (alebo `https://outlook.office365.com`)
5. Vyberte **Application permissions**
6. Zaškrtnite **SMTP.SendAsApp**
7. Kliknite **Add permissions**
8. Kliknite **Grant admin consent for [vaša organizácia]**
9. Potvrďte súhlas

### Kontrola

Po udelení súhlasu by mal byť stav oprávnení:

| Permission | Type | Status |
|-----------|------|--------|
| SMTP.SendAsApp | Application | Granted for [organizácia] |

---

## Krok 4: Vytvorenie Service Principal pre Exchange

Toto je nutný krok — Exchange Online musí vedieť, že vaša aplikácia má právo odosielať e-maily.

### Pomocou PowerShell

Otvorte PowerShell a pripojte sa k Exchange Online:

```powershell
# Nainštalujte modul (ak ešte nemáte)
Install-Module -Name ExchangeOnlineManagement -Scope CurrentUser

# Pripojte sa
Connect-ExchangeOnline -UserPrincipalName admin@example.com

# Vytvorte service principal
# <CLIENT_ID> = Application (client) ID z kroku 1
# <OBJECT_ID> = Object ID z Enterprise Applications (nie z App registration!)
#   Nájdete ho: Entra ID -> Enterprise Applications -> vyhľadajte FileDrop Mailer -> Object ID
New-ServicePrincipal -AppId <CLIENT_ID> -ServiceId <OBJECT_ID>

# Prideľte oprávnenie odosielať e-maily z konkrétneho mailboxu
Add-MailboxPermission -Identity "noreply@example.com" -User <SERVICE_PRINCIPAL_ID> -AccessRights FullAccess
```

### Kde nájsť Object ID (Service Principal)

1. V Entra ID prejdite na **Enterprise Applications** (nie App registrations!)
2. Vyhľadajte `FileDrop Mailer`
3. Skopírujte **Object ID** — toto je `<OBJECT_ID>` pre príkazy vyššie

---

## Krok 5: Povolenie SMTP AUTH pre mailbox

V Exchange Admin Center:

1. Prejdite na **Recipients** -> **Mailboxes**
2. Nájdite mailbox odosielateľa (napr. `noreply@example.com`)
3. Kliknite na mailbox -> **Manage email apps**
4. Zapnite **Authenticated SMTP**
5. Uložte

Alternatívne cez PowerShell:

```powershell
Set-CASMailbox -Identity "noreply@example.com" -SmtpClientAuthenticationDisabled $false
```

---

## Krok 6: Konfigurácia FileDrop

Do vášho `.env` súboru (alebo do Docker Compose environment) nastavte:

```env
SMTP_MODE=oauth2
SMTP_FROM=noreply@example.com
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_OAUTH2_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SMTP_OAUTH2_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SMTP_OAUTH2_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

| Premenná | Hodnota |
|---------|---------|
| `SMTP_MODE` | `oauth2` |
| `SMTP_FROM` | E-mail odosielateľa (musí existovať ako mailbox) — používa sa aj pri smtp režime |
| `SMTP_HOST` | `smtp.office365.com` |
| `SMTP_PORT` | `587` |
| `SMTP_OAUTH2_TENANT_ID` | Directory (tenant) ID z kroku 1 |
| `SMTP_OAUTH2_CLIENT_ID` | Application (client) ID z kroku 1 |
| `SMTP_OAUTH2_CLIENT_SECRET` | Client Secret Value z kroku 2 |

---

## Overenie funkčnosti

Po spustení aplikácie skúste odoslať OTP kód. V logoch backendu by ste mali vidieť:

```
[OTP] Email sent to user@example.com via oauth2, messageId: <...>
```

Ak vidíte chyby:

| Chyba | Riešenie |
|-------|---------|
| `Failed to acquire OAuth2 access token` | Skontrolujte Tenant ID, Client ID a Client Secret |
| `535 5.7.3 Authentication unsuccessful` | Service Principal nie je vytvorený alebo mailbox nemá povolený SMTP AUTH |
| `550 5.7.60 SMTP; Client does not have permissions to send as this sender` | Add-MailboxPermission nebol spustený alebo Identity nesedí |

---

## Obnovenie Client Secret

Client Secret má obmedzenú platnosť. Pred expiraciou:

1. V Entra ID -> App registrations -> FileDrop Mailer -> Certificates & secrets
2. Vytvorte nový secret
3. Aktualizujte `SMTP_OAUTH2_CLIENT_SECRET` v `.env`
4. Obnovte backend kontajner: `docker compose up -d --force-recreate backend` (reštart nestačí — premenné z `.env` sa načítajú len pri vytvorení kontajnera)
5. Starý secret môžete po overení funkčnosti zmazať

---

## Alternatíva: Klasický SMTP

Ak nechcete používať OAuth2, môžete použiť klasický SMTP režim:

```env
SMTP_MODE=smtp
SMTP_FROM=noreply@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=your_password
```

### Pripojenie cez IP adresu (interný SMTP)

Pri pripojení na interný SMTP server cez IP (napr. `10.0.0.1`) môže certifikát platiť len pre DNS meno (`*.example.com`, `example.com`). Overenie TLS potom zlyhá s chybou typu `IP: 10.0.0.1 is not in the cert's list`.

Riešenie: nastavte `SMTP_TLS_REJECT_UNAUTHORIZED=false`:

```env
SMTP_MODE=smtp
SMTP_FROM=noreply@example.com
SMTP_TLS_REJECT_UNAUTHORIZED=false
SMTP_HOST=10.0.0.1
SMTP_PORT=587
SMTP_USER=smtp-user
SMTP_PASS=your_password
```

*Poznámka: Pri použití hostname namiesto IP (ak je dostupný, napr. `smtp.example.com`) ponechajte `SMTP_TLS_REJECT_UNAUTHORIZED=true` alebo premennú vôbec nenastavujte.*

### Vývoj/testovanie bez e-mailov

```env
SMTP_MODE=none
```

V režime `none` sa OTP kódy vypíšu len do logov backendu.
