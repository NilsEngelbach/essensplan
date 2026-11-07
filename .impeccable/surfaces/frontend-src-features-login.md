---
version: 1
slug: "frontend-src-features-login"
primary_target: "frontend/src/features/login"
related_targets: ["frontend/src/features/login/LoginPage.tsx","frontend/src/features/konto/AccountPage.tsx"]
---

# Surface brief: Login & Geräte (login, pairing, password reset, sessions)

Status: confirmed 2026-11-07 (`/impeccable shape login`). Built inside "Das Küchengerät" (DESIGN.md). No concept round: a conventional auth surface inside an established world. Build path: code-led. Prototype built 2026-11-07 (`frontend/src/features/login/`, `konto/DevicesPanel.tsx`, `konto/AccountDetails.tsx`, mock `lib/auth.ts`).

## 1. Job and audience
- **Who:** the owner on a new or expired device; a family member whose device is being added; anyone after logging out.
- **Mode:** Operate. No landing page, no sign-up (D10). The only job is to get into the week fast and stay in.

## 2. Outcome
- A known device stays in for good: the rocker "Angemeldet bleiben" is **on by default** (rolling 1-year session); off means the session ends when the browser closes.
- A new family device gets in **without typing the password**, by pairing with an already logged-in device (code or QR).
- An expired session leads back to the route you were on (`/login?zurueck=…`).

## 3. Direction
- The logged-out app is the **appliance on standby**: the wordmark LED is dark (`led-off`) on every logged-out screen and lights green on a successful login, then the week opens. That is the one fun detail.
- A 56px top bar with only the wordmark; one centred column (max 400px) on `body`. No illustration, tagline or hero.
- One green control per view: "Anmelden", "Link schicken", "Passwort speichern".

## 4. Screens
- **`/login`:** title "Anmelden"; a panel with E-Mail, Passwort (eye toggle), the rocker "Angemeldet bleiben" (on) and the large green "Anmelden". Text button "Passwort vergessen?" sits right of the Passwort label (built: keeps the rocker on its own line on phones). Behind a seam: secondary "Mit Code von anderem Gerät" swaps the panel to code mode in place.
- **Code mode:** one recessed slot with 6 digits in readout type (`inputmode=numeric`, `autocomplete=one-time-code`), auto-submit at 6. Hint: "Den Code zeigt ein angemeldetes Gerät unter Konto → Geräte." A text button back to the password form.
- **`/koppeln/:token`** (QR target): "Gerät wird verbunden…", then LED lights and the week opens. Spent/expired: "Dieser Code ist abgelaufen." + link to `/login`.
- **`/passwort-vergessen`:** E-Mail, green "Link schicken". Then always the same answer (no enumeration): "Wenn es ein Konto mit dieser Adresse gibt, ist jetzt eine Mail unterwegs. Der Link gilt 60 Minuten."
- **`/passwort-zuruecksetzen?token=`:** new password (eye toggle, min. 10 characters), rocker "Alle anderen Geräte abmelden" (off), green "Passwort speichern" → logged in here. Invalid/used: "Dieser Link ist abgelaufen oder schon benutzt." + "Neuen Link anfordern".
- **Konto → panel "Name und E-Mail"** (built name; "Konto" would repeat the page title), last on the page, plus a "Link schicken" text button for a new password: Name (avatar initial, menu) and E-Mail; changing the e-mail asks for the current password inline.
- **Konto → panel "Geräte":** key-row grammar. LED window (lit when active in the last 7 days), automatic label ("iPhone · Safari") + "dieses Gerät", meta "zuletzt aktiv vor …" · "seit 7. Nov." · "bis Browser zu"; "Abmelden" danger text button (toast without undo: the device can simply log in again). "Alle anderen abmelden".
- **Geräte → "Gerät hinzufügen":** inline panel with a QR code (ink on panel) plus the 6-digit code in a recessed readout ("482 913"), Label "noch 9:41". When the new device connects, the LED lights, "Verbunden: Android · Chrome", and the new row flips into the list. "Neuer Code" after expiry.
- **Account menu:** last item "Abmelden", no confirmation → `/login` with "Du bist abgemeldet."

## 5. States
- Wrong credentials: "E-Mail oder Passwort stimmt nicht." (e-mail kept, password cleared).
- Wrong code: "Der Code passt nicht." Wrong codes count against all open codes; after 5 misses they are spent: "Zu viele falsche Codes. Lass dir auf dem anderen Gerät einen neuen Code anzeigen."
- Rate limit: "Zu viele Versuche. Probier es in 5 Minuten wieder."
- No connection: "Keine Verbindung zum Server."
- Submitting: the button keeps its width and reads "Anmelden…"; no spinner page.
- Real `<form>`s with `autocomplete` for password managers; focus on the first empty field; errors announced via `aria-live`.

## 6. Backend consequences
- `sessions`: id hash, user_id, remember, device_label, user_agent, ip, created_at, last_seen_at, expires_at. Persistent cookie when remember, session cookie otherwise.
- `device_links`: code_hash, token_hash, created_by_session, expires_at (+10 min), attempts (max 5), used_at, used_by_session. Single use.
- `POST /auth/login {email, password, remember}` · `POST /auth/pair {code | token}` · `POST /auth/device-links` + `GET /auth/device-links/{id}` (the trusted device polls) · `GET /auth/sessions` · `DELETE /auth/sessions/{id}` · `POST /auth/sessions/revoke-others` · `PATCH /me {name, email, currentPassword}` · forgot/reset with `revokeOthers`.
- Paired devices are always persistent sessions.
- Owner account: imported from Supabase; fallback `bin/console user:create`. No web setup screen.

## 7. Out of scope
- "Passwort ändern" in Konto (goes through the reset mail), passkeys, renaming devices, confirmation mail on e-mail change.
- Direction: the trusted device shows the code; the new device enters or scans it.
