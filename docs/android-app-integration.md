# BloodLink Android App Integration

Version: 1.0  
Backend: Node.js ESM, Express 5, MongoDB, Socket.IO, FCM

This guide maps Android screens and app workflows to the backend routes currently present in this repository. A route can exist without a working service implementation; those gaps are called out explicitly below.

## 1. Environments and shared contract

| Environment | Base URL |
|---|---|
| Android emulator | `http://10.0.2.2:5000` |
| Local device | `http://<development-machine-LAN-IP>:5000` |
| Production | Use the deployed API origin supplied by operations, e.g. `https://api.bloodlink.tech` |

Use these bases:

- User REST API: `{BASE_URL}/v1`
- Socket.IO: `{BASE_URL}` with default `/socket.io` path
- APK download: `{BASE_URL}/downloads/releases/<filename>.apk`

All JSON success responses use `{ "success": true, "data": ... }`; an optional `message` may also be present. Errors use `{ "success": false, "error": { "code": "...", "message": "..." } }`. Honor HTTP status codes. `GET /v1/config` may return `304 Not Modified` with no body.

Send JSON with `Content-Type: application/json`. Authenticated user routes require `Authorization: Bearer <userAccessToken>`. Do not send an admin token to user routes. Keep access/refresh tokens in Android secure storage.

## 2. First launch and app configuration

### Screen: startup/configuration

1. `GET /v1/config`
   - Public; no body.
   - Save the response `ETag` header.
   - On later requests send `If-None-Match: <saved-etag>`.
   - `304` means reuse the cached configuration; `200` means replace it.
   - `data` contains the published config payload, including `version`, `designTokens`, `featureFlags`, `rules`, `onboardingSlides`, `donationCard`, `contact`, `developerInfo`, `legal`, `maintenance`, and `bloodCompatibility`.
2. If `data.maintenance.enabled` is true, show the localized maintenance message and block normal app navigation.
3. `GET /v1/i18n/{lang}` where `lang` is `bn` or `en`.
   - Response data: `{ lang, version, strings }`.
   - Cache aggressively; server sends `Cache-Control: public, max-age=300`.
4. `GET /v1/health` is useful for diagnostics. Response data includes `status`, `service`, `env`, `db`, `uptime`, and `timestamp`.

## 3. Authentication screens

### Register screen

`POST /v1/auth/register` (auth rate limited)

```json
{
  "role": "donor",
  "name": "Tanvir Rahman",
  "email": "user@mail.com",
  "password": "Min8Chars1",
  "phone": "01712345678",
  "language": "bn",
  "consents": {
    "termsAccepted": true,
    "contactAllowed": true,
    "noBloodSelling": true
  },
  "donor": {
    "bloodGroup": "O+",
    "dob": "1995-06-15",
    "gender": "male",
    "weightKg": 65,
    "lastDonationDate": null,
    "donationCount": 0,
    "healthDeclaration": {
      "recentIllness": [],
      "surgery": false,
      "tattooOrPiercing": false,
      "onMedication": false,
      "pregnantOrBreastfeeding": false,
      "chronicDisease": false
    },
    "coordinates": { "lat": 23.8103, "lng": 90.4125 },
    "divisionId": "<24-hex-object-id>",
    "districtId": "<24-hex-object-id>",
    "upazilaId": "<24-hex-object-id>",
    "unionId": "<24-hex-object-id>",
    "villageId": null,
    "villageName": "",
    "radiusKm": 10,
    "nightOk": false
  }
}
```

- `role` is required: `donor` or `requester`. Donor role requires `donor` details.
- The three consent fields are all required and must be `true`.
- `healthDeclaration` is an object, not a boolean.
- The actual OTP purpose names are `verify_email` and `reset_password`.
- Success is HTTP 201; response data is `{ email, requiresEmailVerification: true }`.
- If an email belongs to an unverified account, registration updates that account and issues a new OTP.
- In development without a Resend API key, the OTP appears in server logs as `[DEV EMAIL] OTP CODE: 123456`.

Donor eligibility is validated using the configured `donor` business-rule group (age, weight, and future donation-date checks).

### Verify email screen

`POST /v1/auth/verify-email`

```json
{ "email": "user@mail.com", "code": "123456" }
```

OTP is six digits; default lifetime is 10 minutes and the configured maximum attempts default is 5. On success, the response data is `{ user, tokens: { accessToken, refreshToken, ... } }`. The server also sets a `refreshToken` HttpOnly cookie for web clients; Android should use the returned refresh token in the request body.

### Login screen

`POST /v1/auth/login` (auth rate limited)

```json
{ "email": "user@mail.com", "password": "Min8Chars1" }
```

Response data is `{ user, tokens: { accessToken, refreshToken, accessExpiresIn, refreshExpiresIn } }`. Unverified accounts receive `403 EMAIL_NOT_VERIFIED`; suspended accounts receive `403 ACCOUNT_SUSPENDED`.

### OTP resend screen/action

`POST /v1/auth/resend-otp` (OTP rate limited)

```json
{ "email": "user@mail.com", "purpose": "verify_email" }
```

Allowed purposes: `verify_email`, `reset_password`. Default cooldown is 60 seconds; early resend returns `429 OTP_RESEND_TOO_SOON`.

### Forgot/reset password screens

1. `POST /v1/auth/forgot-password` — `{ "email": "user@mail.com" }`.
2. `POST /v1/auth/verify-reset-otp` — `{ "email": "user@mail.com", "code": "123456" }`; response data contains `resetToken`.
3. `POST /v1/auth/reset-password` — `{ "resetToken": "...", "newPassword": "NewPass123" }`.

Unknown emails receive a generic success response to reduce account enumeration. Password reset revokes existing sessions.

### Token refresh/logout

- `POST /v1/auth/refresh` — Android body: `{ "refreshToken": "<current-refresh-token>" }`. The response contains a rotated token pair under `data.tokens`; persist the new refresh token and discard the old one.
- `POST /v1/auth/logout` — authenticated; body may contain `{ "refreshToken": "..." }`.
- `POST /v1/auth/logout-all` — authenticated; revokes all refresh tokens.
- `POST /v1/auth/change-password` — authenticated body uses `{ "oldPassword": "...", "newPassword": "..." }` (not `currentPassword`).

## 4. Profile and donor screens

The route layer exposes these authenticated endpoints:

| Screen/action | Method and path | Request |
|---|---|---|
| My profile | `GET /v1/me` | — |
| Edit basic/donor fields | `PATCH /v1/me` | `name?`, `phone?`, `donor?` (partial donor form) |
| Avatar | `PUT /v1/me/avatar` | `{ "avatar": "<secure-url>" }` |
| Enable donor mode | `POST /v1/me/donor-mode` or legacy `POST /v1/me/donor-profile` | Full donor form |
| Availability | `PATCH /v1/me/availability` | `{ "isAvailable": true }` |
| Settings | `PATCH /v1/me/settings` | Optional `language`, `theme`, `notificationPrefs`, `privacy` |
| Update location | `PATCH /v1/me/location` or legacy `PUT /v1/me/location` | `{ "coordinates": { "lat": 23.8, "lng": 90.4 } }` |
| Register FCM device | `POST /v1/me/devices` | `{ "fcmToken": "...", "platform": "android", "appVersion?": "...", "deviceId?": "..." }` |
| Remove FCM device | `DELETE /v1/me/devices/:token` or legacy `DELETE /v1/me/devices` | URL token, or body `{ "fcmToken": "..." }` |
| Submit ID verification | `POST /v1/me/id-verification` | `{ "frontImage": "...", "backImage": "...", "selfie": "..." }` |
| Get ID verification | `GET /v1/me/id-verification` | — |
| Donation history | `GET /v1/me/donations` | — |
| Delete account | `DELETE /v1/me` | `{ "password": "..." }` |

Profile operations are implemented in `users.service.js`; still run authenticated API tests against the configured database before release, particularly for ID verification image handling and account deletion retention.

`privacy.showPhone` values: `on_response` (default), `always`, `never`. User-facing strings and notification preferences are localized/configurable.

## 5. Location selection

| Screen/action | Method and path | Query/body |
|---|---|---|
| Divisions | `GET /v1/locations/divisions` | `q?`, `since?`, `limit?` |
| Districts | `GET /v1/locations/districts` | `parentId` (division ObjectId), `q?`, `since?`, `limit?` |
| Upazilas | `GET /v1/locations/upazilas` | `parentId` (district ObjectId), `q?`, `since?`, `limit?` |
| Unions | `GET /v1/locations/unions` | `parentId` (upazila ObjectId), `q?`, `since?`, `limit?` |
| Villages | `GET /v1/locations/villages` | `parentId` (union ObjectId), `q?`, `since?`, `limit?` |
| Submit village | `POST /v1/locations/villages` | `{ "unionId": "...", "nameBn": "...", "nameEn?": "..." }` |
| Search hospitals | `GET /v1/hospitals` | `q?`, `lat?`, `lng?`, `districtId?`, `page?`, `limit?` |
| Submit hospital | `POST /v1/hospitals` | `{ nameBn, nameEn?, coordinates?, divisionId?, districtId?, upazilaId? }` |

Location list query `limit` defaults to 500 and maxes at 1000. Villages are public when approved; optional auth lets a user also see their own pending village. A user-submitted village is pending and can be auto-approved after three distinct users use it.

Coordinates are sent as `{ lat, lng }`; stored GeoJSON order is `[lng, lat]`.

## 6. Donor search and donor detail

- `GET /v1/donors` (auth) query: `bloodGroup?`, `divisionId?`, `districtId?`, `upazilaId?`, `unionId?`, `villageId?`, `lat?`, `lng?`, `page?`, `limit?`.
- `GET /v1/donors/:id` (auth) query: `lat?`, `lng?`. The response includes donor profile/area, eligibility, and distance; phone is returned only when privacy allows `always`.
- `POST /v1/users/:id/reveal-phone` (auth). No body. Requires privacy permission, accepted/donated response when visibility is `on_response`, and daily reveal quota.

Search results exclude the viewer and ineligible/unavailable donors; pages default to 20 and max at 50.

## 7. Blood request screens

All request routes require user auth.

### Create request

`POST /v1/requests`

```json
{
  "patientName": "Rahim Uddin",
  "bloodGroup": "O+",
  "component": "whole_blood",
  "bagsNeeded": 2,
  "neededBy": "2026-11-12T10:00:00.000Z",
  "urgency": "normal",
  "hospitalId": null,
  "hospitalName": "Dhaka Medical College",
  "coordinates": { "lat": 23.8103, "lng": 90.4125 },
  "attendantName": "Karim",
  "attendantRelation": "Brother",
  "attendantPhone": "01712345678",
  "note": { "bn": "", "en": "" },
  "declarationAccepted": true
}
```

`patientName`, `bloodGroup`, `component`, `bagsNeeded`, `neededBy`, `hospitalName`, `coordinates`, `attendantName`, `attendantPhone`, and `declarationAccepted: true` are required by the current validator. The accepted consent field is named `declarationAccepted` (the service stores `consentAccepted`). `neededBy` must be future and within the configured maximum; requests within the urgency threshold become urgent. Account quota: default one per day for accounts under seven days, two otherwise. Success is `201`, data `{ request }`.

### Browse and manage requests

| Screen/action | Method and path | Query/body |
|---|---|---|
| Browse open requests | `GET /v1/requests` | `urgency?`, `bloodGroup?`, `lat?`, `lng?`, `radiusKm?`, `page?`, `limit?` |
| Own requests | `GET /v1/requests/mine` | `page?`, `limit?` |
| Request detail | `GET /v1/requests/:id` | — |
| Edit own open request | `PATCH /v1/requests/:id` | Any supported create fields except declaration |
| Matching preview | `GET /v1/requests/:id/matching-preview` | Owner only |
| Respond | `POST /v1/requests/:id/respond` | `{ "action": "accept" }` or `decline` |
| View responses (owner) | `GET /v1/requests/:id/responses` | — |
| Confirm donation (owner) | `POST /v1/requests/:id/confirm-donation` | `{ "donorId": "<user-id>" }` |
| Fulfill/cancel | `POST /v1/requests/:id/fulfill` / `POST /v1/requests/:id/cancel` | — |
| Report request | `POST /v1/requests/:id/report` | `{ "reason": "..." }` |

Browse returns `{ items, page, limit }` (no `total` in current service); if `lat` and `lng` are supplied each item may include `distanceKm`. The service currently accepts `patientAge`, `patientGender`, and `patientCondition` in validation but does not persist them on create. Donation confirmation currently expects `donorId`, not `responseId`.

## 8. Uploads and ID verification

`POST /v1/uploads/sign` (auth)

```json
{ "preset": "avatar" }
```

Allowed presets: `avatar`, `chat`, `id_verification`. Response data provides `uploadUrl`, Cloudinary `cloudName`, `apiKey`, timestamp, folder, type, and signature. Upload directly to the returned Cloudinary URL using the signed fields. ID verification uses Cloudinary `authenticated` type; never treat those image URLs as public.

After upload, submit the resulting URLs using `POST /v1/me/id-verification`. The `/me` service gap above currently blocks profile/IDV handlers until fixed.

## 9. Notifications and donation card

| Screen/action | Method and path | Query/body |
|---|---|---|
| Notification inbox | `GET /v1/notifications` | `page?`, `limit?`, `unread?` |
| Unread badge | `GET /v1/notifications/unread-count` | — |
| Mark read | `POST /v1/notifications/read` (also `PATCH`) | `{ "ids": ["..."], "all": false }` |
| Donation card | `GET /v1/donation-card` | — |
| Dismiss card | `POST /v1/donation-card/dismiss` | — |
| Motivation email unsubscribe | `GET /v1/email/unsubscribe?token=...` | Public, HMAC-signed |

FCM is data-only. Payload keys include `type`, `channel`, `title_bn`, `title_en`, `body_bn`, `body_en`, plus string data values. Android channel IDs in the service include `urgent_requests`, `blood_requests`, `responses`, `messages`, `account`, and `motivation`.

Donation card appears only for users with at least one donation, unless disabled in config. Dismiss cooldown defaults to 30 days; a later donation can show it again.

## 10. Chat REST and Socket.IO

### REST

All endpoints require user auth.

- `GET /v1/conversations?page=1&limit=20`
- `POST /v1/conversations` body `{ "userId": "<other-user-id>", "requestId?": "<request-id>" }`
- `GET /v1/conversations/:id/messages?before=<message-id>&limit=30`
- `POST /v1/conversations/:id/messages` body `{ "text": "..." }` or `{ "imageUrl": "..." }`
- `POST /v1/conversations/:id/read` — no body.
- `POST /v1/users/:id/block`, `DELETE /v1/users/:id/block`, or `POST /v1/users/:id/unblock`.

Messages require text or image; text max is 2,000 characters. Either participant blocking the other prevents messaging.

### Socket.IO

Connect to `BASE_URL` with `auth: { token: accessToken }`; only user-scope JWTs are accepted. Server joins `user:<userId>`.

- `message:send`: `{ conversationId, clientTempId?, text?, imageUrl? }`; ack `{ success: true, data: message }` or `{ success: false, error }`.
- `message:delivered`: `{ conversationId, messageIds: [...] }`; ack includes `delivered`.
- `message:seen`: `{ conversationId }`; ack includes `marked`.
- `typing:start` / `typing:stop`: `{ conversationId }`.
- `presence:get`: `{ userId }`; ack `{ success: true, data: { userId, online } }`.
- Server events: `message:new`, `message:delivered`, `message:seen`, `typing:start`, `typing:stop`.

Socket message rate limit: 20 sends per 10 seconds per user. Reuse REST send as fallback when disconnected.

## 11. App updates

`GET /v1/app/version?currentVersionCode=1&deviceId=<stable-id>&lang=bn` (public)

Response data includes `updateAvailable`; when available, `latest` includes `versionCode`, `versionName`, `releaseNotes`, `downloadUrl`, `sha256`, `fileSizeBytes`, `mandatory`, and `publishedAt`. Download `BASE_URL + downloadUrl`, verify SHA-256, then invoke Android package install flow. Staged rollout can return `reason: "not_in_rollout"`.

## 12. Current implementation gaps to resolve

- `src/modules/users/users.service.js` currently contains validation schemas but no profile service functions. The mounted `/v1/me/*` routes therefore cannot work until implementations are restored.
- Auth registration donor eligibility currently reads `rules.minAge` instead of `rules.donor.minAge`; confirm/fix before relying on age/weight enforcement.
- Profile UI flows should not ship as production-ready until the above are implemented and HTTP-tested.
