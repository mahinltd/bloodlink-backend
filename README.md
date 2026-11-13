# BloodLink Backend

Node.js + Express + MongoDB + Socket.io backend API.

## How to run

1. Copy `.env.example` to `.env` and fill in the development values.
2. Run `npm run dev`.
3. Run tests with `npm.cmd test` on Windows.

## Location seed

Run `node scripts/seedLocations.js` to import the Bangladesh administrative location hierarchy. See [the location seed notes](./docs/location-seed.md) for data coverage and source attribution.

## Mobile API contract

All paths below are prefixed with `/v1`. Protected routes require:

```http
Authorization: Bearer <accessToken>
```

Protected phone-bearing endpoints require an active, email-verified account. Successful responses wrap their result under `success: true` and `data`; errors use `{ "success": false, "error": { "code": "RATE_LIMITED", "message": "Too many requests" } }`.

### Terms, registration, and phone consent

`GET /config` returns the published `termsVersion` and bilingual `legalTexts.phoneContact`. The existing `/public/site` response also includes published legal content. The new contact terms say:

- **bn:** জীবন বাঁচানোর উদ্দেশ্যে এই কল ও যোগাযোগ ব্যবস্থা দেওয়া হয়েছে। হয়রানি, স্প্যাম বা প্র্যাঙ্ক কল, রক্তের জন্য টাকা চাওয়া, বিপণন বা পুনর্বিক্রয়ের জন্য ফোন নম্বর সংগ্রহ, কিংবা হুমকি দেওয়া নিষিদ্ধ। এমন অপব্যবহারে অ্যাকাউন্ট সাময়িক স্থগিত বা স্থায়ীভাবে নিষিদ্ধ করা হতে পারে এবং প্রযোজ্য আইন অনুযায়ী আইনি ব্যবস্থা নেওয়া হতে পারে।
- **en:** The call and contact system is provided to save lives. Harassment, spam or prank calls, asking for money for blood, collecting phone numbers for marketing or resale, and threats are prohibited. Misuse may result in suspension, a permanent ban, and legal action under applicable law.

Example config fields:

```json
{
  "success": true,
  "data": {
    "termsVersion": "2.0.0",
    "rules": {
      "requests": { "maxBags": 10, "dailyLimit": 2, "sosDailyLimit": 2, "newAccountSosDailyLimit": 1 },
      "matching": { "sosMaxHours": 6, "urgentHours": 24, "normalMaxDays": 7 }
    },
    "legalTexts": {
      "phoneContact": {
        "bn": "জীবন বাঁচানোর উদ্দেশ্যে এই কল ও যোগাযোগ ব্যবস্থা দেওয়া হয়েছে। হয়রানি, স্প্যাম বা প্র্যাঙ্ক কল, রক্তের জন্য টাকা চাওয়া, বিপণন বা পুনর্বিক্রয়ের জন্য ফোন নম্বর সংগ্রহ, কিংবা হুমকি দেওয়া নিষিদ্ধ। এমন অপব্যবহারে অ্যাকাউন্ট সাময়িক স্থগিত বা স্থায়ীভাবে নিষিদ্ধ করা হতে পারে এবং প্রযোজ্য আইন অনুযায়ী আইনি ব্যবস্থা নেওয়া হতে পারে।",
        "en": "The call and contact system is provided to save lives. Harassment, spam or prank calls, asking for money for blood, collecting phone numbers for marketing or resale, and threats are prohibited. Misuse may result in suspension, a permanent ban, and legal action under applicable law."
      }
    }
  }
}
```

`POST /auth/register` now requires explicit `consents.phonePublicInApp: true` for donors. Other required consent flags remain unchanged. The client should send the current `termsVersion` from `/config`.

```json
{
  "role": "donor",
  "name": "Ayesha Rahman",
  "phone": "01712345678",
  "email": "ayesha@example.test",
  "password": "Example123",
  "language": "bn",
  "termsVersion": "2.0.0",
  "consents": {
    "termsAccepted": true,
    "contactAllowed": true,
    "noBloodSelling": true,
    "phonePublicInApp": true
  },
  "donor": {
    "bloodGroup": "A+",
    "dob": "1998-06-10",
    "gender": "female",
    "weightKg": 55,
    "coordinates": { "lat": 23.7, "lng": 90.4 },
    "districtId": "6af4b2c56bce675945a7eb7e"
  }
}
```

Response:

```json
{
  "success": true,
  "message": "Registration successful. Please verify your email.",
  "data": { "email": "ayesha@example.test", "requiresEmailVerification": true }
}
```

`POST /me/donor-mode` uses the donor profile fields above and requires `"consents": { "phonePublicInApp": true }`; consent is stored with its acceptance time and terms version.

```json
{
  "bloodGroup": "A+",
  "dob": "1998-06-10",
  "gender": "female",
  "weightKg": 55,
  "coordinates": { "lat": 23.7, "lng": 90.4 },
  "consents": { "phonePublicInApp": true }
}
```

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "6af4b2c56bce675945a7eb70",
      "modes": { "donor": true, "requester": true },
      "consents": {
        "phonePublicInApp": true,
        "phonePublicInAppAcceptedAt": "2026-07-14T09:00:00.000Z",
        "phonePublicInAppTermsVersion": "2.0.0"
      }
    },
    "donorProfile": {
      "userId": "6af4b2c56bce675945a7eb70",
      "bloodGroup": "A+",
      "isAvailable": true,
      "location": { "type": "Point", "coordinates": [90.4, 23.7] }
    }
  }
}
```

`PATCH /me/settings` can set `privacy.showLastDonation` (default false); it does not change public phone visibility.

```json
{ "language": "bn", "theme": "system", "privacy": { "showLastDonation": false } }
```

```json
{
  "success": true,
  "data": {
    "language": "bn",
    "theme": "system",
    "notificationPrefs": { "push": true, "urgentRequests": true, "normalRequests": true },
    "privacy": { "showPhone": "on_response", "showLastDonation": false }
  }
}
```

Accept terms after `GET /me` returns `needsTermsAcceptance: true`:

```json
{ "termsVersion": "2.0.0" }
```

```json
{ "success": true, "data": { "accepted": true, "acceptedTermsVersion": "2.0.0" } }
```

Example `GET /me` data fields:

```json
{
  "user": {
    "_id": "6af4b2c56bce675945a7eb70",
    "email": "ayesha@example.test",
    "name": "Ayesha Rahman",
    "phone": "01712345678",
    "acceptedTermsVersion": "1.0.0",
    "consents": {
      "phonePublicInApp": true,
      "phonePublicInAppAcceptedAt": "2026-07-14T09:00:00.000Z",
      "phonePublicInAppTermsVersion": "1.0.0"
    }
  },
  "donorProfile": null,
  "eligibility": null,
  "termsVersion": "2.0.0",
  "needsTermsAcceptance": true
}
```

### Donor directory

`GET /donors` and `GET /donors/:id` return a donor phone for the authenticated, verified viewer, regardless of the legacy `privacy.showPhone` value. The app can open the system dialer with the returned number (`tel:<phone>`). Donor results never contain exact coordinates. `lastDonationDate` is omitted unless the donor's `privacy.showLastDonation` is true.

`GET /donors` query parameters: `bloodGroup`, `compatible=true`, `divisionId`, `districtId`, `upazilaId`, `unionId`, `availableOnly`, `eligibleOnly`, `lat`, `lng`, `radiusKm`, `sort=nearest|recently_active`, `page`, `limit`. Coordinates must be supplied together; `nearest` requires coordinates. Defaults are available and eligible donors only, page 1, limit 20; limit max 50. With coordinates, radius defaults to 200 km.

```json
{
  "success": true,
  "data": {
    "items": [{
      "id": "6af4b2c56bce675945a7eb71",
      "name": "Karim Hasan",
      "avatar": null,
      "phone": "01812345678",
      "bloodGroup": "O+",
      "isAvailable": true,
      "isEligible": true,
      "distanceKm": 2.4,
      "area": {
        "division": { "bn": "ঢাকা", "en": "Dhaka" },
        "district": { "bn": "ঢাকা", "en": "Dhaka" },
        "upazila": { "bn": "সাভার", "en": "Savar" },
        "union": null
      }
    }],
    "page": 1,
    "limit": 20,
    "total": 1,
    "hasMore": false
  }
}
```

`GET /donors/:id` returns a `donor` object:

```json
{
  "success": true,
  "data": {
    "donor": {
      "id": "6af4b2c56bce675945a7eb71",
      "name": "Karim Hasan",
      "avatar": null,
      "bloodGroup": "O+",
      "gender": "male",
      "donationCount": 3,
      "idVerified": false,
      "isAvailable": true,
      "isEligible": true,
      "phone": "01812345678",
      "distanceKm": null,
      "area": {
        "division": { "bn": "ঢাকা", "en": "Dhaka" },
        "district": { "bn": "ঢাকা", "en": "Dhaka" },
        "upazila": { "bn": "সাভার", "en": "Savar" },
        "union": null
      }
    }
  }
}
```

`POST /users/:id/reveal-phone` remains deprecated and returns `{ "success": true, "message": "Phone number revealed", "data": { "phone": "01812345678" } }`.

Both donor list and detail are limited to **60 requests per 15 minutes**. The global `/v1` API limit is **300 per 15 minutes**.

### Blood requests

`POST /requests` creates a request. Example body:

```json
{
  "patientName": "Rahim Uddin",
  "patientCondition": "Post-surgery",
  "bloodGroup": "A+",
  "component": "whole_blood",
  "bagsNeeded": 2,
  "neededBy": "2026-07-14T15:00:00.000Z",
  "urgency": "sos",
  "hospitalName": "Dhaka Medical College Hospital",
  "hospitalAddress": "Secretariat Road, Dhaka",
  "wardOrUnit": "Ward 5",
  "coordinates": { "lat": 23.725, "lng": 90.398 },
  "divisionId": "6af4b2c56bce675945a7eb7d",
  "districtId": "6af4b2c56bce675945a7eb7e",
  "upazilaId": "6af4b2c56bce675945a7eb7f",
  "attendantName": "Ayesha Rahman",
  "attendantRelation": "Family Member",
  "attendantPhone": "01712345678",
  "contactPreference": "any",
  "note": { "bn": "", "en": "" },
  "declarationAccepted": true
}
```

The create response includes the persisted request:

```json
{
  "success": true,
  "message": "Request created",
  "data": {
    "request": {
      "_id": "6af4b2c56bce675945a7eb80",
      "patientName": "Rahim Uddin",
      "bloodGroup": "A+",
      "component": "whole_blood",
      "bagsNeeded": 2,
      "urgency": "sos",
      "hospitalName": "Dhaka Medical College Hospital",
      "attendantPhone": "01712345678",
      "contactPreference": "any",
      "neededBy": "2026-07-14T15:00:00.000Z",
      "status": "open"
    }
  }
}
```

`PATCH /requests/:id` accepts a partial body using the same editable fields and returns `{ "success": true, "message": "Request updated", "data": { "request": { "_id": "6af4b2c56bce675945a7eb80", "status": "open", "attendantPhone": "01712345678" } } }`.

`urgency` is `normal|urgent|sos`. Defaults are SOS within 6 hours, urgent after 6 and within 24 hours, normal after 24 hours and no more than 7 days ahead. The server derives urgency when omitted and rejects an explicit urgency that does not match `neededBy`. The legacy `urgentThresholdHours` no longer overrides these windows; its public-config alias is the 24-hour `urgentHours`. Requests expire at `neededBy`; SOS expiry is handled by the existing expiry job. SOS creation limits default to 2 per day, or 1 per day for accounts younger than 7 days.

`GET /requests` filters: `q` (case-insensitive hospital or patient name), `bloodGroup`, `component=whole_blood|platelets|plasma`, `urgency=normal|urgent|sos`, `divisionId`, `districtId`, `upazilaId`, `lat`, `lng`, `radiusKm`, `sort=nearest|newest|urgency`, `page`, `limit`. Coordinates are paired; nearest sorting requires them. Default sorting prioritizes SOS, urgent, then normal, followed by nearest when coordinates are supplied and newest otherwise.

```json
{
  "success": true,
  "data": {
    "items": [{
      "_id": "6af4b2c56bce675945a7eb80",
      "requesterId": {
        "_id": "6af4b2c56bce675945a7eb70",
        "name": "Ayesha Rahman",
        "avatar": null
      },
      "patientName": "Rahim Uddin",
      "patientCondition": "Post-surgery",
      "bloodGroup": "A+",
      "component": "whole_blood",
      "bagsNeeded": 2,
      "urgency": "sos",
      "hospitalName": "Dhaka Medical College Hospital",
      "hospitalAddress": "Secretariat Road, Dhaka",
      "wardOrUnit": "Ward 5",
      "attendantPhone": "01712345678",
      "contactPreference": "any",
      "neededBy": "2026-07-14T15:00:00.000Z",
      "status": "open",
      "distanceKm": 2.1
    }],
    "page": 1,
    "limit": 20,
    "total": 18,
    "hasMore": false
  }
}
```

`GET /requests/sos?lat=23.7&lng=90.4&limit=10&bloodGroup=A%2B` returns active, open, visible SOS requests, nearest first when coordinates are supplied and newest first otherwise. `distanceKm` is rounded to one decimal place. `items` uses the full request card shape shown for `GET /requests`; `banner` is its first item or `null`:

```json
{
  "success": true,
  "data": {
    "items": [{
      "_id": "6af4b2c56bce675945a7eb80",
      "urgency": "sos",
      "bloodGroup": "A+",
      "hospitalName": "Dhaka Medical College Hospital",
      "attendantPhone": "01712345678",
      "neededBy": "2026-07-14T15:00:00.000Z",
      "distanceKm": 2.1
    }],
    "banner": {
      "_id": "6af4b2c56bce675945a7eb80",
      "urgency": "sos",
      "bloodGroup": "A+",
      "hospitalName": "Dhaka Medical College Hospital",
      "attendantPhone": "01712345678",
      "neededBy": "2026-07-14T15:00:00.000Z",
      "distanceKm": 2.1
    }
  }
}
```

```json
{
  "success": true,
  "data": {
    "items": [{ "_id": "6af4b2c56bce675945a7eb80", "urgency": "sos", "attendantPhone": "01712345678", "distanceKm": 2.1 }],
    "banner": { "_id": "6af4b2c56bce675945a7eb80", "urgency": "sos", "attendantPhone": "01712345678", "distanceKm": 2.1 }
  }
}
```

`GET /requests/:id` returns:

```json
{
  "success": true,
  "data": {
    "request": {
      "_id": "6af4b2c56bce675945a7eb80",
      "requesterId": { "_id": "6af4b2c56bce675945a7eb70", "name": "Ayesha Rahman", "avatar": null },
      "patientName": "Rahim Uddin",
      "bloodGroup": "A+",
      "component": "whole_blood",
      "bagsNeeded": 2,
      "urgency": "sos",
      "hospitalName": "Dhaka Medical College Hospital",
      "hospitalAddress": "Secretariat Road, Dhaka",
      "wardOrUnit": "Ward 5",
      "patientCondition": "Post-surgery",
      "attendantPhone": "01712345678",
      "contactPreference": "any",
      "neededBy": "2026-07-14T15:00:00.000Z",
      "status": "open",
      "requesterVerified": false
    },
    "responsesCount": 1,
    "myResponse": "accepted"
  }
}
```

`GET /requests/:id/responses` is owner-only:

```json
{
  "success": true,
  "data": {
    "responses": [{
      "id": "6af4b2c56bce675945a7eb81",
      "status": "accepted",
      "respondedAt": "2026-07-14T09:30:00.000Z",
      "donor": { "id": "6af4b2c56bce675945a7eb71", "name": "Karim Hasan", "avatar": null, "phone": "01812345678" }
    }]
  }
}
```

`GET /requests/responded?page=1&limit=20` returns:

```json
{
  "success": true,
  "data": {
    "items": [{
      "id": "6af4b2c56bce675945a7eb82",
      "status": "accepted",
      "respondedAt": "2026-07-14T09:30:00.000Z",
      "request": {
        "_id": "6af4b2c56bce675945a7eb80",
        "attendantPhone": "01712345678",
        "requesterId": { "_id": "6af4b2c56bce675945a7eb70", "name": "Ayesha Rahman", "avatar": null }
      }
    }],
    "page": 1,
    "limit": 20,
    "total": 1,
    "hasMore": false
  }
}
```

Phone visibility is now uniform for active, verified viewers: request phones are included in feed, SOS, detail, and owner responses for every urgency. No per-viewer consent, acceptance, conversation, or reveal quota is required. Legacy `POST /requests/:id/reveal-phone` is supported and deprecated; it returns `{ "success": true, "message": "Phone number revealed", "data": { "phone": "01712345678" } }`.

`POST /requests/:id/respond` body is `{ "action": "accept" }` or `{ "action": "decline" }`; response is `{ "success": true, "data": { "status": "accepted" } }`. `POST /requests/:id/cancel` returns `{ "success": true, "data": { "status": "cancelled" } }`; `/fulfill` returns `{ "success": true, "data": { "status": "fulfilled" } }`. `POST /requests/:id/confirm-donation` takes `{ "donorId": "6af4b2c56bce675945a7eb71" }`.

Request read endpoints (`GET /requests`, `/requests/sos`, `/requests/:id`, `/requests/:id/responses`, `/requests/responded`) are limited to **60 requests per 15 minutes**.

Report a user with `POST /reports`:

```json
{ "targetType": "user", "targetId": "6af4b2c56bce675945a7eb71", "reason": "Harassing calls" }
```

```json
{
  "success": true,
  "message": "Report submitted",
  "data": {
    "report": {
      "reporterId": "6af4b2c56bce675945a7eb70",
      "targetType": "user",
      "targetId": "6af4b2c56bce675945a7eb71",
      "reason": "Harassing calls",
      "status": "pending"
    }
  }
}
```

The owner may `PATCH /requests/:id` while open, `POST /requests/:id/cancel`, or `POST /requests/:id/fulfill`. Donors use `POST /requests/:id/respond` with `{ "action": "accept"|"decline" }`; the requester confirms an accepted donation with `POST /requests/:id/confirm-donation` and `{ "donorId": "<user-id>" }`. Status values are `open|fulfilled|cancelled|expired`.

### Notifications and chat

`GET /notifications?page=1&limit=20&unread=true`, `GET /notifications/unread-count`, and `POST /notifications/read` are authenticated. Mark one or more read with `{ "ids": ["<notification-id>"] }`, or all with `{ "all": true }`.

Example inbox item and read responses:

```json
{
  "success": true,
  "data": {
    "items": [{
      "_id": "6af4b2c56bce675945a7eb83",
      "type": "request_sos",
      "title": { "bn": "SOS: A+ রক্ত প্রয়োজন", "en": "SOS: A+ blood needed" },
      "body": { "bn": "Dhaka Medical College Hospital · 2 ব্যাগ", "en": "Dhaka Medical College Hospital · 2 bag(s)" },
      "data": { "requestId": "6af4b2c56bce675945a7eb80", "bloodGroup": "A+", "hospitalName": "Dhaka Medical College Hospital", "urgency": "sos" },
      "readAt": null
    }],
    "page": 1,
    "limit": 20
  }
}
```

`GET /notifications/unread-count` returns `{ "success": true, "data": { "count": 1 } }`; `POST /notifications/read` returns `{ "success": true, "data": { "marked": 1 } }`. Device registration returns `{ "success": true, "data": { "deviceId": "<device-id>", "platform": "android" } }`.

Request notifications create an inbox record and FCM data payload. Payload `type` is `request_sos`, `request_urgent`, or `request_normal`; data includes `requestId`, `bloodGroup`, `hospitalName`, and `urgency`. SOS/urgent Android pushes use high priority; SOS also uses the `urgent_requests` channel and default sound. Normal pushes use normal priority. Push/request preferences are `notificationPrefs.push`, `urgentRequests`, and `normalRequests`; email uses `notificationPrefs.email`. SOS email is sent when email is enabled; urgent email additionally obeys the existing global email feature flag and `urgentEmailTopN`. Normal requests do not send email.

Example SOS FCM data:

```json
{
  "type": "request_sos",
  "channel": "urgent_requests",
  "title_bn": "SOS: A+ রক্ত প্রয়োজন",
  "title_en": "SOS: A+ blood needed",
  "body_bn": "Dhaka Medical College Hospital · 2 ব্যাগ",
  "body_en": "Dhaka Medical College Hospital · 2 bag(s)",
  "requestId": "6af4b2c56bce675945a7eb80",
  "bloodGroup": "A+",
  "hospitalName": "Dhaka Medical College Hospital",
  "urgency": "sos",
  "sound": "default"
}
```

Request fan-out uses compatible, available, eligible donors, a configurable recipient cap (default 50) and per-donor daily cap (default 5). SOS matching tries upazila first, then widens to district when fewer than 5 eligible recipients are found. Request+donor notification records are idempotent.

Register devices with `POST /me/devices`:

```json
{ "fcmToken": "<fcm-token>", "platform": "android", "appVersion": "1.0.0", "deviceId": "<device-id>" }
```

Chat uses `POST /conversations` with `{ "userId": "<user-id>", "requestId": "<request-id>" }`, `GET /conversations`, `GET /conversations/:id/messages`, `POST /conversations/:id/messages`, and `POST /conversations/:id/read`. Socket.IO events include `message:send`, `message:new`, `message:delivered`, and `message:seen`. When a recipient is offline, a `message` inbox notification and FCM push are attempted; `notificationPrefs.messages=false` suppresses both. Online delivery uses Socket.IO.

### Demo data

The demo seed creates eight verified demo donor accounts, donor profiles, requests, and donation history. If `--owner-email` identifies an existing user, it also creates linked requests, responses, conversations/messages, inbox notifications, and donor history when applicable. Owner accounts are never created, updated, or deleted. Inserts use models directly; matching, FCM, email, Socket.IO, and notification services are not called. Demo accounts use random password hashes that are never printed and `.invalid` email addresses.

Before any write, take and verify a database backup using the provider's supported backup procedure. There is no staging environment. Use the Render MongoDB URI only in the current PowerShell process; do not put it in `.env`, source control, or command arguments. The URI is read from the prompt and is never printed by the script:

```powershell
$env:MONGODB_URI = Read-Host "Paste the Render MongoDB URI"

# Read-only preview: counts, DB name, masked host, index status, and collision checks.
npm.cmd run seed:demo -- --owner-email "your-test-account@example.com" --lat 23.8103 --lng 90.4125 --phone-base "013000000"

# Apply once the preview and verified backup are checked.
npm.cmd run seed:demo -- --apply --confirm-db "<exact-database-name>" --owner-email "your-test-account@example.com" --lat 23.8103 --lng 90.4125 --phone-base "013000000"

# Re-time only the request IDs recorded by this seed batch.
npm.cmd run seed:demo -- --refresh --confirm-db "<exact-database-name>"

# Preview cleanup, then delete only IDs recorded by this seed batch.
npm.cmd run seed:demo:cleanup -- --dry-run
npm.cmd run seed:demo:cleanup -- --confirm-db "<exact-database-name>"

# Remove the URI from this PowerShell process when finished.
Remove-Item Env:MONGODB_URI
```

`--confirm-db` must exactly match the connected database name. Apply/refresh/cleanup stop when more than 25 non-demo users exist unless `--force` is supplied; `--force` does not broaden cleanup beyond logged IDs. Generated phone numbers follow the Bangladeshi mobile format but could theoretically belong to real people—never dial them in tests. The script checks required indexes read-only and does not create any; production auto-indexing is disabled, so missing geospatial indexes can break coordinate-based features.

### Location filters

Division/district/upazila/union lists are available without authentication at `GET /locations/divisions`, `/locations/districts?parentId=<divisionId>`, `/locations/upazilas?parentId=<districtId>`, and `/locations/unions?upazilaId=<upazilaId>`. Responses use `{ "items": [{ "_id": "...", "nameBn": "...", "nameEn": "..." }] }`.

### Index migration (non-production only)

`node scripts/migrateIndexes.js --dry-run` prints the planned indexes and does not connect to MongoDB. Indexes include geospatial request/donor search, request status/urgency/expiry, donor administrative filters, and unique per-request notification deduplication.

There is no staging environment. Do **not** run the apply command against production. First use the organization's approved process to create and verify a database backup, restore it into an isolated non-production MongoDB instance, and point `MONGODB_URI` only at that restored copy. Then:

```powershell
# Restore the verified backup into a new, isolated, empty non-production database.
mongorestore --uri "<isolated-restored-database-uri>" ".\backups\verified\dump"

$env:NODE_ENV = "development"
$env:BLOODLINK_MIGRATION_TARGET = "non-production"
$env:MONGODB_URI = "<isolated-restored-database-uri>"
node .\scripts\migrateIndexes.js --dry-run
node .\scripts\migrateIndexes.js --apply --non-production --backup ".\backups\verified-restored-copy"
```

The apply command requires the explicit non-production marker and an existing backup path. The migration is idempotent and aborts on conflicting index options. It has not been run against any database.
