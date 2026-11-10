# BloodLink Admin Panel Integration

Version: 1.0  
Audience: Next.js admin panel  
Backend: Node.js ESM, Express 5, MongoDB

This guide follows the mounted route files and current Zod/controller contracts. Use the canonical Admin API base below; do not assume every admin route is under `/v1`.

## 1. Base URL, envelope, and authentication

| Environment | Base URL |
|---|---|
| Local development | `http://localhost:5000/admin` |
| Production | `{DEPLOYED_API_ORIGIN}/admin` |

All responses normally use `{ "success": true, "data": ... }`, optionally with `message`. Errors use `{ "success": false, "error": { "code", "message" } }`.

Admin endpoints require `Authorization: Bearer <adminAccessToken>` except login and 2FA verification. Admin tokens have `scope: admin` and default to 12-hour expiry. The admin auth system is separate from user auth; never use a user token here.

**Routing note:** `/admin` is the complete admin API base. `/v1/admin` is a legacy alias for core admin routes only; system config, translations, releases, locations, campaigns, and CMS are mounted directly at `/admin`.

Global API limiter: 300 requests per 15 minutes per IP. Admin login uses the auth limiter: 10 requests per minute.

## 2. Login and account security screens

### Login

`POST /admin/auth/login` (no bearer token)

```json
{ "email": "admin@example.com", "password": "..." }
```

- If 2FA is enabled, response data: `{ "requires2fa": true, "tempToken": "..." }`.
- Otherwise response data: `{ "requires2fa": false, "accessToken": "...", "admin": { ... } }`.

### Verify 2FA

`POST /admin/auth/verify-2fa` (no bearer token)

```json
{ "tempToken": "...", "code": "123456" }
```

Successful response data includes `accessToken` and `admin`. Code is six digits; temporary token expires in five minutes.

### Authenticated admin security

| Screen/action | Method/path | Body |
|---|---|---|
| Current admin | `GET /admin/auth/me` | — |
| Change password | `POST /admin/auth/change-password` | `{ "currentPassword": "...", "newPassword": "..." }` |
| Start 2FA setup | `POST /admin/auth/2fa/setup` | — |
| Enable 2FA | `POST /admin/auth/2fa/enable` | `{ "code": "123456" }` |
| Disable 2FA | `POST /admin/auth/2fa/disable` | `{ "password": "..." }` |

Render the `otpauthUrl` returned by setup as a QR code. The backend does not render the QR image.

## 3. Role model

Roles: `viewer`, `moderator`, `contentEditor`, `superAdmin`.

| Feature | Allowed roles in current routes |
|---|---|
| Dashboard stats | Any authenticated admin |
| User/IDV/request/report moderation | `superAdmin`, `moderator` |
| Location approval | `superAdmin`, `moderator` |
| Location bulk import | `superAdmin` |
| Config, translations, CMS | `superAdmin`, `contentEditor` |
| Delete translation | `superAdmin` |
| Campaigns | `superAdmin`, `contentEditor` |
| Release manager | `superAdmin` |
| Admin management and audit logs | `superAdmin` |

Hide or disable UI by role, but treat server-side `403` as authoritative. `GET /admin/auth/me` returns the current admin for client role setup.

## 4. Dashboard screen

`GET /admin/dashboard/stats` (any authenticated admin)

Returns aggregated totals for users, donors, requests, pending reports, pending ID verifications, donations, chat, and daily charts. Example shape:

```json
{
  "success": true,
  "data": {
    "users": { "total": 0, "active": 0, "suspended": 0, "unverified": 0, "new24h": 0, "new7d": 0 },
    "donors": { "total": 0, "available": 0, "verified": 0 },
    "requests": { "total": 0, "open": 0, "urgentOpen": 0, "flagged": 0, "hidden": 0 },
    "reports": { "pending": 0 },
    "idVerifications": { "pending": 0 },
    "donations": { "total": 0 },
    "chat": { "conversations": 0, "messages": 0 },
    "charts": { "users": [], "requests": [], "donations": [] }
  }
}
```

## 5. User moderation screens

All routes below require moderator or superAdmin.

| Screen/action | Method/path | Query/body |
|---|---|---|
| User list | `GET /admin/users` | `page?`, `limit?`, `q?`, `status?`, `bloodGroup?` |
| User detail | `GET /admin/users/:id` | — |
| Change status | `PATCH /admin/users/:id/status` | `{ "status": "suspended", "reason": "..." }` or `{ "status": "active" }` |
| Revoke sessions | `POST /admin/users/:id/revoke-sessions` | — |

`status`: `unverified`, `active`, `suspended`, `deleted`. `q` searches email, name, or phone. The list merges a donor profile into each user. Detail includes request/response/donation/device/report counts and latest ID verification. Suspending also disables donor availability and revokes refresh tokens; reactivation clears `suspendedReason`.

Pagination defaults: page 1, limit 20, max 100. Response data: `{ items, total, page, pages }`.

## 6. ID verification queue

Moderator/superAdmin routes:

- `GET /admin/id-verifications?status=pending&page=1&limit=20`
- `GET /admin/id-verifications/:id`
- `POST /admin/id-verifications/:id/approve` — no body.
- `POST /admin/id-verifications/:id/reject` — `{ "reason": "Image is unreadable" }` (2–300 chars).

Queue status values: `pending`, `approved`, `rejected`. Detail returns signed/viewable image URLs as `images: { front, back, selfie }`. Approval sets donor `idVerified`; both actions record reviewer and review time, and notify the user.

## 7. Request and report moderation

Moderator/superAdmin routes:

| Screen/action | Method/path | Query/body |
|---|---|---|
| Request queue | `GET /admin/requests` | `page?`, `limit?`, `status?`, `urgency?`, `flagged=true|false`, `hidden=true|false`, `q?` |
| Request detail | `GET /admin/requests/:id` | — |
| Hide/unhide | `POST /admin/requests/:id/hide` / `/unhide` | — |
| Cancel open request | `POST /admin/requests/:id/cancel` | — |
| Report queue | `GET /admin/reports` | `page?`, `limit?`, `status?`, `targetType?` |
| Resolve report | `POST /admin/reports/:id/resolve` | `{ "action": "dismiss", "note": "..." }` |

Allowed report actions: `dismiss`, `hide_request`, `suspend_user`, `delete_message`. The action must match the report target type. Resolving closes all pending reports for the same target. Request detail includes requester, response count, and reports.

## 8. Config workflow screen

Role: superAdmin/contentEditor. Changes are drafts until published.

| Method/path | Purpose/body |
|---|---|
| `GET /admin/config` | Published config, current draft, versions |
| `GET /admin/config/draft` | Current draft |
| `POST /admin/config/draft` | Create draft copied from current published config |
| `PATCH /admin/config/draft` | At least one editable section; see below |
| `POST /admin/config/publish` | Publish draft; prior published config becomes archived |
| `POST /admin/config/rollback/:version` | Create a new draft based on an old published/archived version |

`PATCH /admin/config/draft` accepts any non-empty subset of:

```json
{
  "designTokens": { "light": {}, "dark": {} },
  "featureFlags": { "urgentEmail": true },
  "businessRules": { "donationGapDays": 120 },
  "onboardingSlides": [],
  "donationCard": {
    "enabled": true,
    "title": { "bn": "", "en": "" },
    "message": { "bn": "", "en": "" },
    "bkashNumber": "",
    "qrImageUrl": "",
    "disclaimer": { "bn": "", "en": "" }
  },
  "contact": {},
  "developerInfo": {},
  "legalTexts": {},
  "maintenance": { "enabled": false, "message": { "bn": "", "en": "" } }
}
```

Editable sections: `designTokens`, `featureFlags`, `businessRules`, `onboardingSlides`, `donationCard`, `contact`, `developerInfo`, `legalTexts`, `maintenance`. Object sections merge one level; array sections replace the array. Public `/v1/config` changes only after publish.

## 9. Translation management

Role: superAdmin/contentEditor, except delete is superAdmin only.

- `GET /admin/translations?page=1&limit=20&q=&group=`
- `POST /admin/translations`: `{ "key": "home.title", "bn": "...", "en": "...", "group": "home" }`
- `POST /admin/translations/bulk`: `{ "items": [{ "key": "...", "bn": "...", "en": "...", "group": "..." }] }` (1–500 items)
- `PATCH /admin/translations/:id`: any non-empty subset of `{ "bn", "en", "group" }`
- `DELETE /admin/translations/:id` (superAdmin)

Keys are 1–120 chars and must match letters/digits plus `_ . : -`. Changes are available immediately through `/v1/i18n/:lang`.

## 10. Release management screen

Role: superAdmin only.

| Method/path | Purpose |
|---|---|
| `GET /admin/releases` | List releases by descending version code |
| `POST /admin/releases` | Create release; multipart form with `apk` file |
| `PATCH /admin/releases/:id` | Update draft metadata |
| `POST /admin/releases/:id/publish` | Publish release |
| `POST /admin/releases/:id/archive` | Archive release |

Multipart text fields: `versionCode`, `versionName`, `releaseNotesBn?`, `releaseNotesEn?`, `mandatory?`, `minSupportedVersionCode?`, `rolloutPercent?`. Booleans can be sent as `true`/`false` strings. File field name is `apk`; current upload middleware allows `.apk` files up to 60 MB. Backend computes SHA-256, stores under `uploads/releases/`, and serves `/downloads/releases/<filename>` without auth.

Public app version check: `GET /v1/app/version?currentVersionCode=1&deviceId=<stable-id>&lang=bn`. Releases include `versionCode`, `versionName`, `releaseNotes`, `downloadUrl`, `sha256`, `fileSizeBytes`, `mandatory`, `publishedAt`.

## 11. Location moderation

Role: moderator/superAdmin; bulk import is superAdmin only.

- `GET /admin/locations/villages?status=pending&page=1&limit=20`
- `POST /admin/locations/villages/:id/approve`
- `POST /admin/locations/villages/:id/reject`
- `GET /admin/locations/hospitals?page=1&limit=20`
- `POST /admin/locations/hospitals/:id/approve`
- `POST /admin/locations/hospitals/:id/reject`
- `POST /admin/locations/import` (superAdmin): optional arrays `divisions`, `districts`, `upazilas`; each item uses `nameEn`, `nameBn`, plus parent names where required.

Approve/reject actions record audit entries. Location management routes are mounted at `/admin` by `src/app.js`.

## 12. Campaign management

Role: superAdmin/contentEditor.

- `GET /admin/campaigns?page=1&limit=20&status=draft|scheduled|sent|cancelled`
- `POST /admin/campaigns`:

```json
{
  "name": "Winter Drive",
  "title": { "bn": "...", "en": "..." },
  "body": { "bn": "...", "en": "..." },
  "channel": "motivation",
  "segment": { "type": "all", "inactiveDays": 30 }
}
```

`segment.type`: `all`, `donors`, `bloodGroup`, `division`, or `inactive`. `bloodGroup`, `divisionId`, and `inactiveDays` apply to their matching segment types.

- `POST /admin/campaigns/:id/send` — sends immediately in FCM batches.
- `POST /admin/campaigns/:id/schedule` — `{ "scheduledAt": "2026-11-10T18:00:00.000Z" }`; campaign dispatch job checks every five minutes.

## 13. CMS screen

Role: superAdmin/contentEditor.

- `GET /admin/cms` — response data is `{ sections, version }`; `sections` contains published `legalTexts`, `onboardingSlides`, `contact`, and `developerInfo`.
- `PATCH /admin/cms/:section` — body is an object containing fields for the section. Allowed sections: `legalTexts`, `onboardingSlides`, `contact`, `developerInfo`.

CMS writes to the existing config draft; publish through `/admin/config/publish` for changes to become public.

## 14. Admin account management and audit

superAdmin only:

- `GET /admin/admins`
- `POST /admin/admins`: `{ "email": "...", "name": "...", "password": "...", "role": "viewer" }`
- `PATCH /admin/admins/:id`: non-empty subset of `{ "name", "role", "status" }`
- `GET /admin/audit-logs?page=1&limit=20&action=&adminId=`

Roles: `superAdmin`, `moderator`, `contentEditor`, `viewer`. A superAdmin cannot change their own role or status.

## 15. Current routing notes

- Canonical Admin URL is `/admin`. The `/v1/admin` alias exposes core admin routes only; system, location, campaign, and CMS routers are direct `/admin` mounts.
- Admin moderation and system routes are protected independently with `protectAdmin`; role checks are also enforced on the server.
- API responses follow the shared success/error envelope. Always handle 401, 403, 404, 409, and 429 explicitly.
