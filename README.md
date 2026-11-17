# 🧭 Locus — Leave Your Mark on the Landscape

**Locus** is a geospatial memory platform that lets loved ones anchor personal stories, photos, voice recordings, and videos to physical places.

When a Recorder (e.g., Dad) tags a meaningful location—like a childhood home, a park bench, or a favorite neighborhood bakery—members of their private Circle (e.g., Daughter) see a teaser pin on their shared map. When the Viewer physically visits that location with the **Locus Mobile App** and steps inside the tag's unlock radius, the memory permanently unlocks across both their **Mobile App** and the **End-User Web Portal**.

---

## 🏗️ Project Architecture

```text
locus/
├── locus.code-workspace   # Multi-root VS Code Workspace file
├── docker-compose.yml     # `db` (postgis/postgis:16-3.4, port 5432) + `backend` (Django, port 8000)
├── .env.example           # Env template for backend, web & docker-compose (copy to .env)
├── .vscode/               # Tasks (backend, web, mobile, Docker stack), launch debuggers, recommended extensions
├── db/fly.toml            # Fly.io private PostGIS app (postgis/postgis:16-3.4 + volume)
├── backend/               # Django 5 REST API + GeoDjango on PostgreSQL/PostGIS + custom Admin Portal (Port 8000)
│   ├── Dockerfile         # Python 3.12 image with GDAL/GEOS/PROJ; gunicorn (docker-compose runs migrate + seed_demo + runserver)
│   ├── fly.toml           # Fly.io API app (volume at /data for media + logs)
│   ├── requirements.txt   # Django, DRF, SimpleJWT, django-cors-headers, Pillow, psycopg 3, python-dotenv
│   ├── locus_backend/     # Settings (PostGIS engine, GDAL/GEOS paths, JWT, CORS, logging), root URLs
│   ├── core/
│   │   ├── models.py      # UserProfile, Circle, CircleMembership, Tag, TagMedia, TagUnlock, CircleMessage
│   │   ├── views.py       # /api/auth/{register,login,me}, /api/circles/, /api/tags/ (incl. unlock action)
│   │   ├── serializers.py # Hides story & media until unlocked; adds distance from viewer
│   │   ├── geo.py         # Geodesic distance (meters) for geofence unlock checks
│   │   ├── signals.py     # Auto-create UserProfile; audit-log events to the `locus` logger
│   │   ├── admin.py, admin_views.py   # Django Admin + Storage Quota Dashboard & Live Log Viewer
│   │   ├── management/commands/seed_demo.py   # Demo users, Circle, and tags
│   │   ├── migrations/    # Schema migrations
│   │   └── tests.py       # Locked-content and unlock-radius API tests
│   ├── templates/admin/   # Admin index override + operations_storage / operations_logs pages
│   ├── logs/              # Runtime log files read by the Log Viewer (contents git-ignored)
│   └── media/             # Uploaded TagMedia files (created at runtime, git-ignored)
├── web/                   # End-User Web Portal (React 18 + TypeScript + Vite, Port 5173)
│   └── src/
│       ├── App.tsx        # Shell: Recorder/Viewer switcher, memories list, Circle group chat
│       ├── api.ts, types.ts           # Typed REST client and shared API types
│       └── components/    # LocusMapView (Google Maps if a key is set, else Leaflet/OpenStreetMap),
│                          # TagEditorModal (create/edit, browser voice recording, uploads), TagDetailPanel
└── mobile/                # Cross-Platform iOS & Android App (Expo SDK 58 + React Native + TypeScript)
    ├── App.tsx            # react-native-maps scavenger hunt, GPS geofence unlock, expo-audio & photo capture
    ├── app.json           # Bundle IDs, permissions, and Expo plugins
    ├── app.config.js      # Injects native Google Maps keys from mobile/.env at build time
    ├── .env.example       # Template for mobile/.env (API base URL, Maps keys)
    └── eas.json           # Expo Application Services (EAS) cloud build & store submission config
```

> **Note:** PostGIS is the database engine, but `Tag` still stores its location as plain `latitude` / `longitude` float columns, and unlock distances are computed in Python (`core/geo.py`), not with PostGIS spatial queries.

---

## 🚀 Quick Start (Local Development in VS Code)

### 0. Environment files
Two git-ignored env files, each created from a committed template:

| File | Template | Used by |
|---|---|---|
| `.env` (repo root) | `.env.example` | Django backend, web portal (Vite), docker-compose |
| `mobile/.env` | `mobile/.env.example` | Expo mobile app (Expo only reads `.env` from `mobile/`) |

```powershell
copy .env.example .env
copy mobile\.env.example mobile\.env
```

* **`DJANGO_SECRET_KEY`** — generate one: `python -c "import secrets; print(secrets.token_urlsafe(50))"`
* **Google Maps (optional)** — the only third-party API key. Without it the web portal uses OpenStreetMap.
  * Web: `VITE_GOOGLE_MAPS_API_KEY` (Maps JavaScript API) plus `VITE_GOOGLE_MAPS_MAP_ID` (Map Management, or `DEMO_MAP_ID` for dev)
  * Mobile builds: `GOOGLE_MAPS_ANDROID_API_KEY` (Maps SDK for Android) in `mobile/.env`, injected by `mobile/app.config.js`. Not needed in Expo Go.
* **Testing on a physical phone** — set `EXPO_PUBLIC_API_BASE_URL` to `http://<your computer's LAN IP>:8000/api` and add that IP to `DJANGO_ALLOWED_HOSTS`.

### 1. Backend API & Administrative Web Portal (`backend/`)
The backend runs on **PostgreSQL + PostGIS** (GeoDjango). You need a PostGIS database and the native GDAL/GEOS libraries:

* **Docker (easiest):** `docker compose up db` starts PostGIS on port 5432 using the `POSTGRES_*` values in `.env`. `docker compose up --build` also runs the backend in a container.
* **macOS (Homebrew):** `brew install postgresql@16 postgis gdal geos`, start Postgres, then create the role/database from `.env` and run `CREATE EXTENSION postgis;` in it. If Django can't find GDAL/GEOS, set `GDAL_LIBRARY_PATH` / `GEOS_LIBRARY_PATH` in `.env`.
* **Windows:** install PostgreSQL with the PostGIS bundle (Stack Builder) and GDAL via [OSGeo4W](https://trac.osgeo.org/osgeo4w/), or use Docker.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt

# Run migrations and seed demo users & memories
python manage.py migrate
python manage.py seed_demo

# Start the API & Admin server on http://localhost:8000
python manage.py runserver 0.0.0.0:8000
```

* **Seeded Demo Accounts:**
  * **Recorder & Admin:** `todd` / `locus123`
  * **Viewer (Daughter):** `daughter` / `locus123`
* **Administrative Web Portal:** [http://localhost:8000/admin/](http://localhost:8000/admin/)
  * Includes **User Profile & Storage Quota Management** (`/admin/operations/storage/`)
  * Includes **Live Application & Geofence Log Viewer** (`/admin/operations/logs/`)

### 2. End-User Web Interface (`web/`)
Allows recorders to create, edit, and delete tags from anywhere (including browser voice recording and multi-file photo/audio/video uploads), view the shared Circle map, and chat with Circle members.

```powershell
cd web
npm install
npm run dev
```
* Open [http://localhost:5173](http://localhost:5173)
* Use the **🔄 Switch to Daughter (Viewer) / Dad (Recorder)** button in the top bar to experience both perspectives immediately!

### 3. Mobile App for iOS & Android (`mobile/`)
Built with **Expo (React Native)** so one codebase runs natively on both iPhone and Android and publishes to the Apple App Store and Google Play Store.

```powershell
cd mobile
npm install
npx expo start
```
* Scan the QR code with the **Expo Go** app on your iPhone or Android phone, or press `a` for Android Emulator / `i` for iOS Simulator.

---

## 📱 Publishing to the Apple App Store & Google Play Store
Because `mobile/` uses **Expo Application Services (EAS)** (`mobile/eas.json`), you do **not** need a Mac to compile the iOS binary:
1. Install the EAS CLI: `npm install -g eas-cli`
2. Log in to your Expo account: `eas login`
3. Build for both stores in the cloud:
   * `eas build --platform ios`
   * `eas build --platform android`
4. Submit to Apple App Store Connect & Google Play Console:
   * `eas submit --platform ios`
   * `eas submit --platform android`
