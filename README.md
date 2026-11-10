# 🧭 Locus — Leave Your Mark on the Landscape

**Locus** is a geospatial memory platform that lets loved ones anchor personal stories, photos, voice recordings, and videos to physical places.

When a Recorder (e.g., Dad) tags a meaningful location—like a childhood home, a park bench, or a favorite neighborhood bakery—members of their private Circle (e.g., Daughter) see a teaser pin on their shared map. When the Viewer physically visits that location with the **Locus Mobile App** and steps inside the tag's unlock radius, the memory permanently unlocks across both their **Mobile App** and the **End-User Web Portal**.

---

## 🏗️ Project Architecture

```text
locus/
├── locus.code-workspace   # Multi-root VS Code Workspace file
├── docker-compose.yml     # PostgreSQL + PostGIS + Django Backend stack
├── .env.example           # Env template for backend, web & docker (copy to .env)
├── .vscode/               # VS Code tasks, launch debuggers, and recommended extensions
├── backend/               # Python Django REST API + GeoDjango + Custom Admin Portal (Port 8000)
│   ├── locus_backend/     # Django settings, URLs, logging, & JWT auth config
│   ├── core/              # Models (Tag, TagMedia, TagUnlock, Circle, CircleMessage), API views, Admin
│   └── templates/admin/   # Custom Django Admin views (Storage Quota Dashboard & Live Log Viewer)
├── web/                   # End-User Web Portal (React + TypeScript + Vite, Port 5173)
│   └── src/               # Remote Tag Creator Studio, Shared Circle Map, & Circle Group Chat
└── mobile/                # Cross-Platform iOS & Android App (React Native + Expo + TypeScript)
    ├── App.tsx            # Native Google Maps scavenger hunt, GPS geofence unlock, & field audio/photo recorder
    ├── app.json           # iOS App Store & Google Play Store permissions & bundle config
    └── eas.json           # Expo Application Services (EAS) cloud build & store submission config
```

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
The backend supports **PostgreSQL + PostGIS** (via Docker) as well as a **zero-setup local mode** (SQLite + exact Haversine geodesic distance math) so you can run and debug immediately in VS Code on Windows without installing C GDAL binaries.

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
