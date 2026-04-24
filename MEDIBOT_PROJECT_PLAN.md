# MediBot — Project Documentation & Evolution Plan

> **Author:** Dr. KARA — Chef de Service Pédiatrie, Hôpital de Rouiba  
> **Project:** MediBot — Système de distribution automatisée de médicaments  
> **Stack:** FastAPI · React · MQTT · ESP32/STM32 · SQLite · Mosquitto · Android (planned)

---

## 1. Project Overview

MediBot is a **medical robot assistant** designed for the pediatric ward at Rouiba Hospital. It automates medication dispensing, manages patient prescriptions, tracks medical staff access via RFID badges, and provides a complete audit trail of all clinical actions.

The system is built around **patient safety**, with strict role-based access, allergy conflict detection, drug interaction alerts, high-risk medication second-validation, and full traceability from prescription to dispensing.

### Core goals
- Eliminate manual medication dispensing errors in pediatric care
- Enforce strict medical protocols (dosage, timing, authorization)
- Give the Chef de Service full visibility and control
- Work **offline-first** — the robot must function without internet
- Provide remote access for doctors outside the hospital via a secure online backup server

---

## 2. Current Architecture

```
medibot/
├── backend/          # FastAPI app + routers
├── firmware/         # ESP32 (WiFi/MQTT) + STM32F4 (RFID/Drawers)
├── frontend/         # React app
│   └── src/
│       ├── features/admin/views/   # Admin pages
│       ├── kiosk/                  # KioskView (bedside tablet UI)
│       ├── shared/components/
│       ├── shared/context/
│       ├── shared/hooks/
│       └── shared/types/
├── mosquitto/        # MQTT broker config
└── tools/
```

### Tech stack
| Layer | Technology |
|---|---|
| Backend API | FastAPI (Python) |
| Frontend | React + TypeScript + Tailwind |
| MQTT Broker | Eclipse Mosquitto |
| Microcontrollers | ESP32 (WiFi/MQTT) + STM32F4 (RFID/Drawers) |
| RFID | RC522 via SPI |
| Database | SQLite (local) |
| Auth | Username + Password + RFID Badge + PIN |

---

## 3. Current Features

### Kiosk View (bedside tablet)
- RFID badge scan to authenticate doctor
- Room and patient selection
- Medication dispensing with drawer control
- Allergy conflict detection
- Drug interaction detection with second-validation
- High-risk medication double-confirmation
- Post-visit notes
- Session idle timeout and auto-logout
- Prescription validation gate

### Admin View (laptop)
- Dashboard with KPIs
- Room management
- Patient management (full dossier)
- Pharmacy and stock management
- Prescription validation
- Drug interaction rules
- Analytics and shift reports
- Medical team (Équipe Médicale) management
- Audit log
- Technical / Engineer view (MQTT status, firmware, hardware)

### Patient data
- Full identity: name, DOB, weight, height, blood group with phenotype (CcEeK — locked after double validation)
- Allergies (drug + other)
- Diagnosis and medical notes
- Vaccination status
- Active treatments
- Ordonnances (prescriptions)
- Photo
- Pediatric age calculation:
  - 0–12 months → displayed in months
  - 1–5 years → displayed as "X ans Y mois"
  - Over 5 years → displayed in years
- Weight alert if incompatible with calculated age

### Ordonnance (Prescription)
- Unique identifier
- Prescription date and last modified date
- Prescripteur (linked to RFID badge)
- Medication: dose in mg, number of doses, duration, timing (fasting / with meal / etc.)
- Multiple ordonnances per patient
- Pharmacy link: mg dose → ml calculation via ampoule data
- Internes blocked from creating or modifying ordonnances

### Audit log
- Tracks: logins, dispenses, emergency alerts, kiosk operations, robot actions
- Before/after data snapshots for all modifications
- Filterable by actor, action, date

### RFID
- Format: 8 characters max, uppercase alphanumeric only

---

## 4. Current Medical Roles

| Role | Prescribe | Dispense | Manage Team | Full Access |
|---|---|---|---|---|
| Médecin Chef Pédiatrie | ✅ | ✅ | ✅ | ✅ |
| Médecin | ✅ | ✅ | ❌ | ❌ |
| Pédiatre | ✅ | ✅ | ❌ | ❌ |
| Infirmière | ❌ | ✅ | ❌ | ❌ |
| Interne | ❌ | ✅ | ❌ | ❌ |

---

## 5. Known Issues to Fix (Immediate)

### AUTH
- [ ] Login broken for user `kara` / password `kara1235`
- [ ] Root cause unknown — could be seed, hash, or payload mismatch
- [ ] Must be diagnosed and fixed without breaking existing auth flow

### Doctor Signup
- [ ] Create doctor flow is broken or disconnected
- [ ] Frontend form exists but backend route may be failing
- [ ] Need to restore end-to-end: form → POST → DB → success

### Permissions
- [ ] Privileged actions are blocked for the admin user
- [ ] Role-based access checks may be too restrictive or misconfigured
- [ ] Must restore full access for `Médecin Chef Pédiatrie` only

---

## 6. Planned Modifications

### 6.1 Équipe Médicale — Page Improvements

The medical team page must become a full account management interface:

- Full table: name, username, RFID, role, status (Active/Suspended), creation date, last activity
- **Add doctor** form: full name, username, password, RFID, role, PIN, photo, account status
- **Edit doctor**: all fields editable except username (locked after creation)
- **Suspend**: block login and access without deleting the account or its history
- **Reactivate**: restore access to a suspended account
- **Change role**: reassign role with audit log entry
- **Reset password / PIN**
- **Delete**: only allowed if doctor has no activity history; otherwise force suspension
- Prevent duplicate RFID and duplicate username
- Prevent suspending the last active admin account
- Log all actions in audit trail

Roles to support:
- Médecin Chef Pédiatrie (full access)
- Médecin
- Pédiatre
- Médecin Résident *(new)*
- Médecin Assistant *(new)*
- Interne (no prescription)
- Infirmière

### 6.2 Kiosk View → Android App (Samsung Galaxy Tab A9+)

- Convert KioskView from React web component to a dedicated Android application
- Target device: Samsung Galaxy Tab A9+
- Lock device to kiosk app only (Samsung Knox or Android kiosk mode)
- Large touch-optimized buttons
- No access to admin pages from tablet
- Short session timeout with auto-logout
- Offline/error fallback screen
- The tablet connects to the local server via LAN IP (not localhost)

### 6.3 Administration — Laptop Only

- Full admin interface remains on the laptop (web browser or Electron)
- No admin features exposed on the kiosk tablet
- Admin URL must be separate from kiosk URL

### 6.4 Network Architecture

#### Local (primary)
- Local server runs on laptop on the hospital network
- Backend binds to `0.0.0.0` so all devices on LAN can connect
- Tablet kiosk uses `http://[LAPTOP_LAN_IP]:[PORT]` as API base URL
- Robot, tablet, and laptop all communicate on local network
- Robot must work even when internet is down

#### Online (backup + remote access)
- Secondary server hosted on a VPS or cloud (internet-facing)
- Doctors can access administration page remotely when outside hospital
- Must have HTTPS, strong auth, MFA (future), RBAC, audit logs
- Online server is NOT the source of truth for live robot operations
- Background sync: local → remote when internet is available

#### Sync strategy
- Local = source of truth
- Sync pushes: patients, doctors, prescriptions, audit logs, stock changes
- Conflict handling: deterministic rules, no silent overwrites
- Robot never waits for cloud confirmation before acting

### 6.5 Codebase Cleanup

- Analyze full project structure
- Identify and list dead or unused files
- Remove duplicate logic
- Standardize naming conventions across frontend and backend
- Clean environment/config handling
- Fix broken imports and disconnected routes
- Audit all role-based access guards
- Ensure DB schema matches all active features
- Prepare codebase for Android kiosk split and cloud sync addition

---

## 7. Pediatric Safety Priorities

These are non-negotiable constraints that must be preserved and never broken:

- Prescriptions must support patients from **2 kg to 40 kg** (newborns included)
- Dynamic growth curves for weight and height
- Algerian-specific protocols
- **Absolute traceability** of every dosage — who, what, when, to which patient
- Weight incompatible with age → alert must fire
- mg → ml auto-calculation via pharmacy/ampoule data
- Error pattern analysis by shift for team management
- Blood group phenotype locked after double validation

---

## 8. UI/UX Rules

- Admin interface: designed for doctors and medical staff, not engineers
- Use **medical KPI language**, not HTTP methods or JSON jargon
- Audit filters design (actor + action filter) is approved — preserve it
- All dates in French format
- Kiosk UI: large buttons, minimal navigation, touch-optimized

---

## 9. Request to Cursor AI

> **Read this entire document carefully before generating any plan.**  
> Do not start writing code. Generate a **structured plan with numbered blocks** first.

### What I need from you

Analyze this project and generate a **complete step-by-step plan** structured in blocks. Each block must:
- Have a clear title
- List the files or components it affects
- Describe what will be done (diagnosis, fix, add, refactor, or build)
- Specify the order and dependencies between blocks
- Flag any risks or constraints

### Blocks to plan

**BLOCK 1 — Project audit and file inventory**
- Map all existing files across backend, frontend, firmware, tools
- List dead, duplicate, or broken files
- Identify disconnected routes, broken imports, unused components
- Output: file map + issues list

**BLOCK 2 — Auth and login repair**
- Diagnose login failure for `kara` / `kara1235`
- Fix the true root cause (seed, hash, payload, or session)
- Validate end-to-end login flow
- Output: working login

**BLOCK 3 — Doctor signup and account management repair**
- Diagnose broken create-doctor flow
- Restore backend route + frontend form wiring
- Output: working doctor creation

**BLOCK 4 — Permissions and role access repair**
- Audit all RBAC guards in backend and frontend
- Restore full access for `Médecin Chef Pédiatrie`
- Preserve restrictions for limited roles (especially internes)
- Output: correct role enforcement

**BLOCK 5 — Équipe Médicale page — full rebuild**
- Add suspend / reactivate / change role / reset password actions
- Add new roles: Médecin Résident, Médecin Assistant
- Add account status column and status-based filtering
- Add audit log entries for all account management actions
- Output: complete medical team management page

**BLOCK 6 — Codebase cleanup**
- Apply findings from Block 1
- Remove dead files, fix naming, standardize config
- Output: clean, organized project ready for new features

**BLOCK 7 — Network and API preparation**
- Refactor API base URL to be environment-configurable (not hardcoded localhost)
- Prepare backend to bind on `0.0.0.0` for LAN access
- Add environment config for local vs remote server
- Output: multi-device ready backend and frontend config

**BLOCK 8 — Online hosting preparation**
- Add HTTPS support via reverse proxy config (Nginx or Caddy)
- Add production-safe auth (secure cookies or JWT)
- Add RBAC enforcement on all server-side routes
- Prepare sync endpoint structure (local → remote)
- Output: production-ready server config

**BLOCK 9 — Kiosk Android app planning**
- Define which features stay in kiosk vs admin
- Define API surface needed by Android kiosk
- Plan kiosk app architecture (React Native or WebView wrapper)
- Output: Android kiosk spec and build plan

**BLOCK 10 — Validation and documentation**
- Test all repaired flows end-to-end
- Validate pediatric safety constraints
- Update README and inline documentation
- Output: stable, documented, production-ready MediBot

---

### Cursor instructions

- Do not skip blocks
- Do not combine blocks unless explicitly told
- Start with Block 1 before touching any code
- After each block, summarize: what changed, what files, what risks remain
- Preserve all existing medical business logic
- Never remove audit trail functionality
- Never open permissions globally — fix targeted access only

---

*Document generated: April 2026 — Hôpital de Rouiba, Service Pédiatrie*
