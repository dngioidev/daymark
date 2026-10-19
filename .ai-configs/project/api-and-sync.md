# Daymark REST API & Sync Protocol

Concise specification of the backend synchronization server (`server.ts`) and client integration.

---

## 1. Server Configuration & Environment Variables

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP listening port (Express + Vite) |
| `DAYMARK_USER` | `admin` | Admin username for login & device pairing |
| `DAYMARK_PASSWORD` | `daymark2026` | Admin password |
| `NODE_ENV` | `development` | Set to `production` for static asset serving from `dist/` |

---

## 2. Authentication Methods
1. **Bearer Token**: `Authorization: Bearer <token>` returned by `POST /api/auth/login`.
2. **Basic Auth**: `Authorization: Basic <base64(user:password)>` for curl/scripts.

---

## 3. Endpoint Reference

All endpoints are prefixed with `/api`.

| Method | Endpoint | Auth | Purpose | Payload / Response |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | None | Service heartbeat & version | Returns `{ status: 'ok', version, totalDevices }` |
| `POST` | `/api/auth/login` | None | Authenticate admin user | Body: `{ username, password }` $\to$ Returns `{ token, user }` |
| `POST` | `/api/auth/change-password` | Bearer | Update password | Body: `{ currentPassword, newPassword }` |
| `GET` | `/api/devices` | Bearer | List paired sync devices | Returns `{ devices: DeviceInfo[] }` |
| `POST` | `/api/devices` | Bearer | Register a new device | Body: `{ deviceName, platform }` |
| `DELETE` | `/api/devices/:id` | Bearer | Revoke paired device | Revokes sync access for device ID |
| `POST` | `/api/sync` | Bearer/Basic | Bidirectional note sync | Body: `SyncPayload` $\to$ Returns merged updates |
| `GET` | `/api/server/stats` | Bearer | Vault size & note counts | Returns document counts and storage metrics |

---

## 4. Sync Protocol Architecture
- **Local-First**: Client retains primary state in `localStorage` (`src/utils/vaultStore.ts`).
- **Reconciliation**:
  - Client sends modified documents with checksums.
  - Server reconciles updates per-document using `lastModified` timestamps without destroying historical journal entries.
  - Sync state is reflected in the UI sync status indicator.
