# Single Environment Configuration (.env)

The backend now uses a single consolidated `.env` file for all configuration.

## Environment File: `.env`

All environment variables (Database, JWT, Uploads, VPS Sync, etc.) are centralized inside `.env`.

### Standard Run Commands

- Development: `npm run dev`
- Build: `npm run build`
- Production: `npm run start`

### Configuration Sections in `.env`

1. **Database Connection (`MONGODB_URI`)**: Active database connection string.
2. **Auth & Security (`JWT_SECRET`, `JWT_EXPIRES_IN`)**: Secret keys and token durations.
3. **Frontend Integration (`FRONTEND_URL`)**: Allowed origins for CORS.
4. **Storage (`UPLOAD_ROOT_DIR`, `UPLOAD_PUBLIC_BASE`)**: Local & production upload directories.
5. **VPS Upload Sync (`UPLOAD_SYNC_*`)**: Configuration for auto-syncing local uploads to VPS.
