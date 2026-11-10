# BloodLink Public Website Integration

Version: 1.0  
Audience: Next.js landing/public website  
Auth: None for the endpoints in this guide

## 1. Base URL

| Environment | API base |
|---|---|
| Local development | `http://localhost:5000/v1` |
| Production | `{DEPLOYED_API_ORIGIN}/v1` |

APK files are served outside `/v1` at `{DEPLOYED_API_ORIGIN}/downloads/releases/<filename>.apk`.

The API allows browser origins listed in backend `CORS_ORIGINS`. Ask operations to add the deployed website origin when configuring production CORS.

## 2. Response and caching conventions

Successful JSON responses use:

```json
{ "success": true, "data": { } }
```

A response may also include `message`. Errors use:

```json
{ "success": false, "error": { "code": "...", "message": "..." } }
```

Use HTTP statuses rather than relying only on the JSON body. Config uses ETag revalidation and can return `304 Not Modified` without a body. The i18n endpoint sets `Cache-Control: public, max-age=300`.

## 3. Homepage screen

### Recommended request

`GET /v1/public/site?lang=bn`

Supported language values: `bn` (default) and `en`.

Response data shape:

```json
{
  "appName": "BloodLink",
  "tagline": "...",
  "contact": {},
  "developerInfo": {},
  "legalTexts": {},
  "latestRelease": null,
  "stats": {
    "totalDonors": 0,
    "availableDonors": 0,
    "totalRequests": 0,
    "fulfilledRequests": 0,
    "totalDonations": 0,
    "totalBagsCollected": 0
  }
}
```

Use this single endpoint for the homepage hero/content, contact links, latest APK card, and public impact counters. Server-side Next.js rendering or ISR is suitable; a revalidate interval around 300 seconds aligns with the stats cache.

### Stats-only widgets

`GET /v1/public/stats`

No query/body/auth. Response data has `totalDonors`, `availableDonors`, `totalRequests`, `fulfilledRequests`, `totalDonations`, and `totalBagsCollected`. The backend caches stats in memory for five minutes.

## 4. Download page and APK button

The homepage response `data.latestRelease` is either `null` or contains:

```json
{
  "versionCode": 2,
  "versionName": "1.1.0",
  "releaseNotes": "...",
  "downloadUrl": "/downloads/releases/bloodlink-1.1.0-2.apk",
  "sha256": "...",
  "fileSizeBytes": 12345678,
  "mandatory": false,
  "publishedAt": "..."
}
```

Use `href = API_ORIGIN + downloadUrl`. `downloadUrl` is already an absolute-path URL, so do not prefix `/v1`. The static file route is public, returns APK MIME type, and sets attachment disposition.

`GET /v1/public/latest-release?lang=bn` returns `{ release: latestReleaseOrNull }` and can be used by a dedicated download page. The mobile app uses a different endpoint for rollout decisions:

`GET /v1/app/version?currentVersionCode=1&deviceId=<stable-id>&lang=bn`

The public website generally does not need this device-specific check. It can display the latest published release directly.

### Download integrity

If verifying the file in the browser/server download flow, calculate SHA-256 over the downloaded bytes and compare to `latestRelease.sha256`. Show version name, release notes, and file size from metadata. When there is no published release, hide or disable the APK download action.

## 5. Legal, contact, and CMS content

The public site response includes `contact`, `developerInfo`, and `legalTexts`. Admin edits CMS sections as draft config content and must publish that config before the public site sees the changes.

The public response prefers `legalTexts` and falls back to the legacy `legal` field, so older published configs remain readable while new CMS drafts can save `legalTexts` directly.

Contact and developer fields are returned as config objects; render optional fields defensively and do not assume phone/website/social URLs are populated.

## 6. Config endpoint (optional for website design system)

`GET /v1/config` is public and returns the published app/site config inside `data`, with an `ETag` response header.

Caching flow:

1. Fetch once and store both the `data` payload and ETag.
2. Revalidate with `If-None-Match: <etag>`.
3. On 304, use cached data; on 200, replace cache and ETag.

The payload includes design tokens, feature flags, business rules exposed publicly, onboarding content, donation-card config, contact, developer info, legal/maintenance content, and blood compatibility. Never treat this public configuration as a source of authorization policy; server-side authorization remains authoritative.

## 7. Translation endpoint

`GET /v1/i18n/bn` or `GET /v1/i18n/en`

Response data:

```json
{ "lang": "bn", "version": "...", "strings": { "app.name": "..." } }
```

The server responds with a five-minute public cache header. Unknown languages fail validation; only `bn` and `en` are accepted.

## 8. Basic availability check

`GET /v1/health` returns service status and DB connection state. It is intended for operational health checks; do not make a public web page depend on internal uptime details for normal rendering.

## 9. Public routes summary

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/v1/public/site?lang=bn` | Homepage data in one response | No |
| GET | `/v1/public/stats` | Public aggregate counters | No |
| GET | `/v1/public/latest-release?lang=bn` | Latest APK metadata | No |
| GET | `/v1/config` | Published config + ETag | No |
| GET | `/v1/i18n/:lang` | Translation dictionary | No |
| GET | `/v1/app/version` | Device-specific app update check | No |
| GET | `/downloads/releases/:file.apk` | Static APK download | No |
| GET | `/v1/health` | API/DB health | No |
