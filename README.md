# BloodLink Backend

BloodLink is a voluntary blood donation platform for Bangladesh. This repository contains the Node.js backend that powers its REST API, real-time chat, notifications, and scheduled jobs.

## Features

- Donor and user registration, email verification, login, password recovery, and rotating refresh tokens
- Donor profiles, availability, location, donation history, and eligibility cooldowns
- Blood request creation and status management, donor responses, and donor matching
- Notifications through the API, Socket.IO, email, and Firebase Cloud Messaging
- Real-time conversations, chat messages, and image/voice uploads
- Donation confirmation, donor badges, and donation certificates
- Identity verification, user reports, blocking, and administrative moderation
- Role-based admin tools, optional two-factor authentication, and audit logs
- Scheduled request-expiry and donor-reminder jobs
- Optional image and file storage through Cloudinary and Cloudflare R2

## Technology

- Node.js (CommonJS) and Express 5
- MongoDB with Mongoose
- Socket.IO
- Firebase Admin, Resend, Cloudinary, and Cloudflare R2 integrations

## Requirements

- Node.js 20 or newer
- npm
- MongoDB for persistent application data

## Setup

1. Clone the repository and enter its directory:

   ```sh
   git clone https://github.com/mahinltd/bloodlink-backend.git
   cd bloodlink-backend
   ```

2. Install dependencies:

   ```sh
   npm install
   ```

3. Create a local environment file from the safe template:

   ```sh
   cp .env.example .env
   ```

   On Windows PowerShell, use:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Configure `MONGODB_URI`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET` in `.env`. Use long, independently generated secrets; never commit `.env` or share production credentials.

5. Start the server:

   ```sh
   npm run dev
   ```

   For a normal start without the development file watcher:

   ```sh
   npm start
   ```

The server listens on port `5000` by default. Change it with `PORT`. The API prefix defaults to `/api/v1` and can be changed with `API_PREFIX`.

## Environment Variables

`.env.example` documents all supported variables and is safe to commit. Optional integrations can be left unconfigured until needed.

| Variable | Required | Purpose |
|---|---:|---|
| `PORT` | No | HTTP port; defaults to `5000` |
| `NODE_ENV` | No | Runtime mode; set to `production` for deployments |
| `API_PREFIX` | No | API prefix; defaults to `/api/v1` |
| `MONGODB_URI` | Yes for persistent use | MongoDB connection string |
| `JWT_ACCESS_SECRET` | Yes for production | User access-token signing secret |
| `JWT_REFRESH_SECRET` | Yes for production | User refresh-token signing secret |
| `JWT_ACCESS_EXPIRES_IN` | No | Access-token lifetime; defaults to `15m` |
| `JWT_REFRESH_EXPIRES_IN` | No | Refresh-token lifetime; defaults to `30d` |
| `CLIENT_URL` | No | Allowed public client origin |
| `ADMIN_URL` | No | Allowed admin client origin |
| `API_URL` | No | Public API URL used by integrations |
| `RESEND_API_KEY` | No | Resend email service key |
| `EMAIL_FROM` | No | Email sender address |
| `FIREBASE_PROJECT_ID` | No | Firebase project identifier |
| `FIREBASE_CLIENT_EMAIL` | No | Firebase service-account email |
| `FIREBASE_PRIVATE_KEY` | No | Firebase service-account key; escaped `\n` sequences are supported |
| `CLOUDINARY_CLOUD_NAME` | No | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | No | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | No | Cloudinary API secret |
| `R2_ACCOUNT_ID` | No | Cloudflare account identifier |
| `R2_ACCESS_KEY_ID` | No | Cloudflare R2 access key |
| `R2_SECRET_ACCESS_KEY` | No | Cloudflare R2 secret key |
| `R2_BUCKET_NAME` | No | R2 bucket name |
| `R2_ENDPOINT` | No | S3-compatible R2 endpoint; used for private verification-image uploads and signed URLs |
| `R2_PUBLIC_URL` | No | Public base URL for stored objects |
| `OTP_EXPIRES_IN_MINUTES` | No | Email OTP lifetime; defaults to `10` |
| `DEFAULT_SEARCH_RADIUS_KM` | No | Initial donor-search radius; defaults to `10` km |
| `MAX_SEARCH_RADIUS_KM` | No | Maximum donor-search radius; defaults to `100` km |
| `DONATION_COOLDOWN_DAYS` | No | Donor cooldown after donation; defaults to `90` days |
| `ADMIN_JWT_SECRET` | No | Admin access-token signing secret |
| `ADMIN_JWT_EXPIRES_IN` | No | Admin token lifetime; defaults to `8h` |
| `ADMIN_TOTP_ENCRYPTION_KEY` | No | Encryption key for configuring admin 2FA |

Production startup requires `MONGODB_URI`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET`. In development, missing database settings allow the server to start without persistent data, and missing user JWT secrets are replaced with temporary secrets that change on restart. Configure all required production values before deployment.

## API

The default local API base URL is `http://localhost:5000/api/v1`. The configured production API URL is `https://api.bloodlink.tech/api/v1`.

| Endpoint | Purpose |
|---|---|
| `GET /` | Root service status |
| `GET /health` | Root health probe |
| `GET /api/v1/health` | API health status, runtime, and database connection state |

Active API groups use the configured API prefix:

| Route group | Purpose |
|---|---|
| `/auth` | Registration, email verification, login, token refresh, and account security |
| `/users` | User profiles, FCM tokens, blocking, and account actions |
| `/donors` | Donor profiles, search, availability, and location |
| `/requests` | Blood requests, responses, and request status |
| `/matching` | Donor matching and match previews |
| `/notifications` | Notifications and unread counts |
| `/conversations` | Conversation lists and chat history |
| `/messages` | Chat image/voice uploads and message actions |
| `/reports` | User reports |
| `/donations` | Donation history, confirmations, badges, and certificates |
| `/verification` | Identity verification requests |
| `/admin` | Admin authentication, dashboards, and moderation |

Protected REST endpoints use an access token in the `Authorization: Bearer <token>` header. Socket.IO clients authenticate by providing the access token in the handshake `auth.token` field. See the route files in `src/routes/` for the implemented endpoint definitions.

## Create the First Admin

Configure `.env` with a working `MONGODB_URI`, then run:

```sh
node scripts/createAdmin.js "Admin Name" "admin@example.com" "A-strong-password" super_admin
```

The password must be at least 10 characters. Supported roles include `super_admin`, `verification_admin`, `support_admin`, `content_admin`, and `monitoring_admin`. Avoid placing real passwords in shell history or shared logs.

## Operations and Deployment

- Set `CLIENT_URL` and `ADMIN_URL` to the exact browser origins allowed by CORS.
- Use strong, unique secrets for user and admin token signing and admin 2FA encryption.
- Configure and verify credentials for any enabled email, push-notification, and file-storage integrations.
- Configure a MongoDB deployment with suitable access controls and backups.
- The server starts scheduled request-expiry, donor-reminder, and cooldown jobs as part of startup.
- General API requests are rate limited to 300 requests per 15 minutes; authentication routes use a 30-request limit per 15 minutes.
- Run behind a trusted reverse proxy in production; the application enables proxy-aware request handling.

## Repository Contents

Application code is under `src/`, and the one-time admin creation script is under `scripts/`. Dependency manifests and the safe `.env.example` are included. Local `.env` files, `node_modules`, documentation, tests, and runtime-only directories such as logs and uploads are excluded from Git. Empty directories are not stored by Git.

## License

This project is marked `UNLICENSED` in `package.json`. Contact the project owner before redistributing or reusing it.
