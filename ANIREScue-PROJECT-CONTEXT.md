# AniRescue — Complete Project Context & Handoff

> Purpose: This document is the single project-context file for AniRescue. Give it to a new AI before asking it to modify, audit, explain, deploy, or extend the project.
>
> Last maintained: 2026-09-30
> Repository: khanmehtab276/AniRescue

---

## 1. Project Identity

**Project name:** AniRescue

**Full description:** AI-Powered Animal Rescue & Volunteer Coordination Platform

**Academic context:** Final-year Computer Engineering major project.

**Core problem:** People need a simple way to report injured animals with evidence and location. The platform validates reports with AI, coordinates rescue work with volunteers/NGOs, tracks the rescue lifecycle, supports evidence submission and verification, and sends notifications.

**Main roles:**

- USER — reports animals and tracks their own cases.
- VOLUNTEER — receives/claims eligible rescue cases, performs rescue work, submits evidence, and manages availability/location.
- NGO — coordinates cases within its jurisdiction, dispatches associated/eligible volunteers, manages rescue operations, and verifies completion where authorized.
- ADMIN — global operational oversight, case management, AI review, verification, user/system administration.

---

## 2. Most Important Architecture Rule

AniRescue intentionally has exactly **two application microservices**:

1. Main Backend API
2. AI Async Worker

Do NOT create a standalone authentication microservice.

Authentication remains inside the main backend.

Do NOT migrate the project to another framework.

Keep:

- React
- Vite
- Tailwind CSS
- React Router
- Express
- Node.js
- PostgreSQL / Neon
- RabbitMQ
- Python
- YOLOv11
- Firebase / FCM
- Cloudinary
- Docker Compose

Supporting infrastructure such as PostgreSQL, RabbitMQ, Firebase, Cloudinary, and hosting is infrastructure, not a third application microservice.

Do not introduce Kubernetes, GraphQL, Redis, event sourcing, or other unnecessary infrastructure unless a genuine requirement appears.

The project is a college major project. The target is:

**stable + understandable + realistic + demonstrable + secure**

not enterprise complexity.

---

## 3. High-Level Architecture

The intended data flow is:

    USER / VOLUNTEER / NGO / ADMIN
                 |
                 v
          React Frontend
                 |
                 v
          Express Backend
             /       \
            v         v
      PostgreSQL    RabbitMQ
                       |
                       v
                  AI Worker
                  Python
                  YOLOv11
                       |
                       v
                  PostgreSQL

Notifications:

    Backend event
        |
        +--> DB notification
        |
        +--> active FCM device tokens
                    |
                    v
                 Firebase
                    |
                    v
              Frontend device

AI processing is asynchronous. The API should not wait for YOLO inference.

---

## 4. Technology Stack

### Frontend

- React 19
- Vite
- Tailwind CSS
- React Router
- Axios
- Leaflet / React Leaflet
- Firebase Web SDK
- PWA
- Lucide icons

### Backend

- Node.js
- Express
- PostgreSQL
- Neon
- JWT
- bcrypt
- Firebase Admin / FCM
- RabbitMQ / amqplib
- Node cache
- Helmet
- CORS
- rate limiting
- Cloudinary

### AI Worker

- Python
- YOLOv11
- RabbitMQ
- PostgreSQL
- Cloudinary image retrieval

### Infrastructure

- Docker Compose
- Neon PostgreSQL
- CloudAMQP RabbitMQ
- Cloudinary
- Firebase
- Render for backend
- Firebase Hosting for frontend

---

## 5. Repository Structure

Important directories:

    /
    ├── Backend/
    │   ├── src/
    │   ├── migrations/
    │   ├── server.js
    │   └── package.json
    │
    ├── Frontend/
    │   ├── src/
    │   ├── public/
    │   ├── package.json
    │   └── vite configuration
    │
    ├── ai-async-worker/
    │   ├── source/code
    │   ├── weights/
    │   └── Docker configuration
    │
    └── docker-compose.yml

The frontend directory is intentionally named:

    Frontend/

not frontend/.

---

## 6. Backend API

Main case routes currently include:

    POST /cases/report
    GET  /cases/admin/junk
    PUT  /cases/:id/verify-junk
    GET  /cases/:id/nearby-volunteers
    GET  /cases/volunteer/available
    GET  /cases/mine
    PUT  /cases/:id/claim
    PUT  /cases/:id/assign
    PUT  /cases/:id/release
    PUT  /cases/:id/cancel
    PUT  /cases/:id/complete
    PUT  /cases/:id/verify-completion
    PUT  /cases/:id/priority
    GET  /cases/verification-queue
    GET  /cases/map
    GET  /cases/
    GET  /cases/:id

There is intentionally no generic unsafe:

    PUT /cases/:id/status

Frontend code should use the dedicated action endpoints.

There is currently no GET /notifications endpoint. Do not invent a notification inbox UI that depends on one unless the backend is actually extended.

---

## 7. Case Lifecycle

The core lifecycle is:

    PENDING_VALIDATION
          |
          v
    PROCESSING_ANALYSIS
          |
          +------------------+
          |                  |
          v                  v
    VALIDATION_PASSED   REJECTED_JUNK
          |
          v
    IN_PROGRESS
          |
          v
    RESCUE_COMPLETED
          |
          v
    RESOLVED

Cancellation is a separate terminal workflow:

    ... --> CANCELLED

Rejected AI/junk cases are handled through the human review flow.

Do not invent random statuses.

Every status change must remain consistent across:

- database
- backend
- frontend
- badges
- filters
- timelines
- notifications
- dashboards

---

## 8. Volunteer Availability

Volunteer states currently include:

- OFFLINE
- AVAILABLE
- ON_RESCUE

Meaning:

### AVAILABLE

Volunteer is ready to receive eligible rescue work.

### ON_RESCUE

Volunteer is currently handling a rescue.

A volunteer should not be simultaneously treated as available for another active rescue.

Location freshness is tracked by the backend.

The frontend uses volunteer presence/location functionality rather than continuously sending location every second.

---

## 9. Volunteer Active-Rescue Safety

A volunteer should handle only one active rescue at a time.

A local pending database migration was added:

    Backend/migrations/006_volunteer_active_rescue_guard.sql

It creates:

    idx_one_active_rescue_per_volunteer

This is a partial unique index on assigned_volunteer_id for IN_PROGRESS cases.

The controller also contains targeted protection in:

- claimCase()
- assignCase()
- cancelCase()

The local working-tree version of cases.controller.js has three intentional changes:

1. VOLUNTEER claim prevents a second IN_PROGRESS rescue.
2. CANCELLED cases clear assigned_volunteer_id.
3. NGO/ADMIN assignment checks whether the selected volunteer already has an active rescue.

These changes were syntax-checked successfully and git diff --check passed.

Migration 006 is the next database migration after 001–005. Existing migrations 001–005 were already applied before 006 was created.

Do not rerun 001–005.

---

## 10. Role Authorization

Backend authorization is the source of truth.

Frontend role checks are only for UI visibility.

Never rely on frontend checks for security.

### USER

Can:

- register/login
- report animals
- upload evidence
- provide location
- view own cases
- track own cases
- receive relevant notifications

Cannot:

- claim other cases
- assign volunteers
- verify rescues
- manage other users' cases

### VOLUNTEER

Can:

- register/login
- set availability
- update location
- view eligible rescue cases
- claim eligible cases
- manage assigned rescue work
- submit evidence
- release an assigned case where authorized
- view rescue history

Must not access unrelated private cases.

### NGO

Can:

- configure NGO jurisdiction
- view jurisdiction-relevant cases
- coordinate rescues
- claim eligible cases if backend permits
- find nearby eligible volunteers
- assign volunteers where authorized
- set priority where authorized
- verify completion where authorized

NGO jurisdiction must always be respected.

An NGO with no jurisdiction must not accidentally receive global case access.

### ADMIN

Can:

- view global cases
- manage cases
- review AI/junk cases
- assign volunteers where authorized
- set priority
- verify rescue completion
- manage users
- access global operational information

Admin has broad access but backend authorization still applies to every sensitive operation.

---

## 11. Important Security Rules

Always audit for:

- IDOR
- broken access control
- SQL injection
- unsafe file upload
- JWT misuse
- secret exposure
- CORS mistakes
- XSS
- sensitive error leakage
- overly broad API responses
- unsafe map data

Example IDOR:

A USER must not be able to change:

    /cases/22

to:

    /cases/23

and see another user's private case.

Case detail authorization is backend-enforced.

Current case-detail access is role-aware:

- ADMIN — global
- USER — own reported cases
- VOLUNTEER — assigned or eligible validated cases
- NGO — jurisdiction-based

---

## 12. AI Worker

The AI worker is a separate application microservice.

Expected flow:

    RabbitMQ message
          |
          v
    image retrieval
          |
          v
    YOLOv11 inference
          |
          v
    validation result
          |
          v
    database update
          |
          v
    case status / notification

YOLO model:

    YOLOv11

Current known supported animal classes include:

- bird
- cat
- dog
- horse
- sheep
- cow
- elephant
- bear
- zebra
- giraffe

The worker should not trust arbitrary remote URLs.

Current hardening restricts worker image retrieval to the approved Cloudinary HTTPS path.

RabbitMQ processing should acknowledge messages only after appropriate processing.

Do not add another AI model unless required.

---

## 13. Planned AI Extension

Gemini has been discussed as a planned addition for:

- preliminary first-aid guidance
- severity assessment

Important:

Gemini is a planned/future component unless the current repository actually contains an implemented Gemini integration.

Do not tell users, examiners, or documentation that Gemini is implemented if it is only planned.

It can be described as future work in the academic paper.

---

## 14. Notifications

Backend notification flow:

    Backend event
         |
         v
    create DB notification
         |
         v
    active device tokens
         |
         v
    Firebase FCM push

Current notification work includes:

- DB notification records
- FCM device tokens
- backend push attempts
- invalid FCM token deactivation
- event-based notification handling
- notification consumer behavior

There is no general GET /notifications endpoint at present.

Do not create a fake notification center that claims to load historical notifications from an endpoint that does not exist.

---

## 15. Frontend Design Identity

AniRescue should look like an animal-rescue product, not a generic SaaS admin template.

Design direction:

- clean
- modern
- compassionate
- operational
- emergency-aware
- emerald primary accent
- warm stone neutrals
- dark/light mode
- soft surfaces
- restrained neumorphic influence
- meaningful motion
- animal/paw/rescue visual language

Use color by meaning:

- Emerald — rescue/success/confirmed
- Red/Rose — urgent/danger
- Amber — attention/waiting
- Violet — AI processing/review
- Blue/Sky — location/coordination

Do not make every component brightly colored.

Do not put animal photographs behind every dashboard.

Use strong imagery primarily for:

- landing page
- report experience
- selected hero areas

Operational pages should remain readable.

---

## 16. Animation Rules

Existing project animation utilities include rescue-themed animations such as:

- rescue fade-up
- rescue pop
- rescue dash
- rescue stagger

Use animations for:

- route transitions
- drawer opening
- case list entry
- success state
- AI processing indicator
- urgent map markers

Do not make everything bounce or pulse.

Respect:

    prefers-reduced-motion

---

## 17. Current Navigation Redesign

The previous mobile bottom navigation was removed.

There is now one unified Menu control.

The same Menu concept works on:

- mobile
- tablet
- desktop

The navigation menu contains role-specific destinations plus:

- Profile
- Logout

This avoids duplicating the same navigation in:

- hamburger menu
- mobile bottom bar

The navigation was updated on branch:

    frontend-ux-redesign

---

## 18. Current Role Navigation

### USER

    Overview
    Report Rescue
    My Cases
    Rescue Map
    Profile

Routes:

    /dashboard
    /report
    /dashboard/cases
    /map
    /profile

Important distinction:

Overview is a summary.

My Cases is the complete personal case workspace.

They must not be the same page.

---

### VOLUNTEER

    Rescue Hub
    Available Cases
    Active Rescue
    Rescue History
    Rescue Map
    Profile

Routes:

    /volunteer
    /volunteer/cases
    /volunteer/active
    /volunteer/history
    /map
    /profile

The hub answers:

    What should I do right now?

Available Cases answers:

    What rescue cases can I accept?

Active Rescue answers:

    What rescue am I currently handling?

History answers:

    What rescues have I completed?

---

### NGO

    Operations
    Rescue Cases
    Volunteers
    Verification
    Operations Map
    Profile

Routes:

    /ngo
    /ngo/cases
    /ngo/volunteers
    /verification
    /map
    /profile

Important backend constraint:

The current API does not expose a global NGO volunteer list.

The Volunteers workspace therefore uses the supported case-based nearby-volunteer flow.

Do not invent a global volunteer roster endpoint.

---

### ADMIN

    Control Center
    Report Rescue
    All Rescue Cases
    AI Validation
    Verification
    Global Map
    Profile

Routes:

    /admin
    /report
    /admin/cases
    /admin/ai-validation
    /verification
    /map
    /profile

Important distinction:

Control Center is network-level overview.

All Rescue Cases is the global case inventory.

AI Validation is human review of AI-flagged cases.

These must not collapse into one dashboard.

---

## 19. Current Frontend Workspace Files

The UX redesign branch now contains dedicated workspace pages:

    Frontend/src/pages/UserCases.jsx
    Frontend/src/pages/VolunteerWorkspace.jsx
    Frontend/src/pages/NGOWorkspace.jsx
    Frontend/src/pages/AdminWorkspace.jsx

The main router is:

    Frontend/src/App.jsx

Navigation is:

    Frontend/src/components/Navbar.jsx

Existing pages remain important:

    UserDashboard.jsx
    VolunteerDashboard.jsx
    NGODashboard.jsx
    AdminDashboard.jsx
    CaseDetail.jsx
    ReportCase.jsx
    MapView.jsx
    Profile.jsx
    VerificationQueue.jsx
    Landing.jsx
    Login.jsx

Before deleting old pages, verify whether anything still imports them.

---

## 20. Frontend Shared Components

Reuse the existing design system.

Important components include:

- Badge
- BentoStats
- Button
- CaseCard
- CaseTimeline
- EmptyState
- LoadingState
- SectionHeader
- StatCard
- Surface
- AvailabilityToggle

Do not create a second button/card/badge system unnecessarily.

Different role pages should use different information structures while sharing the same primitives.

---

## 21. Report Experience

Target report flow:

    1. Animal image
    2. Location
    3. Description/details
    4. Review
    5. Submit

After successful submission:

    Report submitted successfully
    Case #XX
    AI validation has started

Then:

    View Case

Frontend validation must match backend validation.

Client validation is not security.

Backend remains authoritative.

---

## 22. Case Detail

CaseDetail is intended to be the central reusable case-management screen.

It should display:

- case number
- status
- priority
- reported time
- animal image
- description
- location
- map
- timeline
- role-appropriate actions

Timeline must come from backend case history.

Never invent events.

Role actions should correspond to actual backend authorization.

Examples:

USER:

    Track

VOLUNTEER:

    Claim
    Submit Evidence
    Release

NGO:

    Claim
    Assign Volunteer
    Set Priority
    Verify Completion

ADMIN:

    Assign
    Set Priority
    Verify
    Cancel

Only expose an action when the backend actually permits it.

---

## 23. Map

Map API:

    GET /cases/map

The backend intentionally exposes minimal active map information.

Map must:

- validate coordinates
- show only appropriate active cases
- use correct status/priority meanings
- avoid exposing sensitive descriptions
- remain usable on mobile

Current map center is Mumbai as a reasonable default for the project context.

Do not expose private case information through map popups.

---

## 24. PWA

Frontend uses a PWA setup.

Audit:

- service worker
- manifest
- installability
- update prompt
- caching
- offline behavior
- private API response caching

Never cache private API responses in a way that can expose one user's information to another user.

---

## 25. Database Migrations

Current migration files:

    001_phase2_rbac_and_evidence.sql
    002_role_profiles_and_ngo_coverage.sql
    003_ngo_volunteers.sql
    004_notifications.sql
    005_device_tokens.sql
    006_volunteer_active_rescue_guard.sql

001–005 were already applied.

006 is the new volunteer active-rescue safety migration.

There is no migration npm script in Backend/package.json.

Do not invent:

    npm run migrate

unless a real migration runner is added.

Do not rerun already-applied migrations.

---

## 26. Docker / Infrastructure

Docker Compose contains the application/infrastructure services.

Important project constraint:

Host machine has approximately 8 GB RAM.

AI worker target:

- about 2 GB memory
- about 1.5 CPU

Keep resource usage reasonable.

Docker Compose may warn that:

    version: "3.8"

is obsolete with modern Compose.

That warning is not an application failure. It can be cleaned up when appropriate.

---

## 27. Render / Production

Backend production deployment uses Render.

Do not automatically change production branch/deployment settings.

Production must not require local absolute paths such as:

    /home/iamatomic/...

Required production configuration should be documented through environment variables.

Potential secrets include:

- DATABASE_URL
- JWT_SECRET
- RabbitMQ URL
- Cloudinary credentials
- Firebase credentials
- CORS origin

Never commit real credentials.

---

## 28. Firebase

Firebase project is used for:

- frontend Firebase configuration
- FCM
- hosting

Firebase Admin private credentials must never be committed.

The Firebase Admin SDK JSON is ignored by git.

---

## 29. Cloudinary

Cloudinary is used for image storage.

Do not store huge base64 image payloads in PostgreSQL if the architecture already uses Cloudinary.

Audit:

- upload size
- file type
- empty files
- failed uploads
- invalid URLs
- cleanup
- mobile camera support

Backend must not trust client-side upload validation alone.

---

## 30. Testing Commands

Backend syntax:

    cd Backend
    node --check src/controllers/cases.controller.js

Frontend build:

    cd Frontend
    npm run build

Git whitespace:

    git diff --check

Git state:

    git status

Docker configuration:

    docker compose config

Do not claim a test passed unless it was actually run.

---

## 31. Real User Flows

### USER

    Register
      ↓
    Login
      ↓
    Report animal
      ↓
    Upload image
      ↓
    Location
      ↓
    Submit
      ↓
    Case created
      ↓
    AI validation
      ↓
    Track case
      ↓
    View case detail

### VOLUNTEER

    Login
      ↓
    Become available
      ↓
    Location active
      ↓
    View eligible cases
      ↓
    Claim
      ↓
    IN_PROGRESS
      ↓
    Rescue
      ↓
    Submit evidence
      ↓
    Verification
      ↓
    RESOLVED

### NGO

    Login
      ↓
    Configure jurisdiction
      ↓
    View jurisdiction cases
      ↓
    Find nearby eligible volunteers
      ↓
    Assign volunteer
      ↓
    Rescue
      ↓
    Verification
      ↓
    RESOLVED

### ADMIN

    Login
      ↓
    Control Center
      ↓
    Global case inventory
      ↓
    AI review if required
      ↓
    Assignment / priority / verification
      ↓
    Global operations

---

## 32. UX Principles

AniRescue should not feel like four copies of one dashboard.

The four roles have different jobs:

### USER

Compassion + clarity.

Main question:

    What is happening to the animal I reported?

### VOLUNTEER

Field action + urgency.

Main question:

    What rescue should I handle now?

### NGO

Coordination + dispatch.

Main question:

    Which cases need operational action and which volunteer should respond?

### ADMIN

Network oversight + control.

Main question:

    What is happening across the entire rescue system?

---

## 33. Visual Inspiration Rules

When researching external products for inspiration:

Look for patterns such as:

- emergency reporting
- photo-first incident reporting
- rescue case status
- volunteer availability
- live dispatch
- geographic maps
- operational queues
- evidence/verification
- humane animal imagery
- strong empty states

Do not copy another product's branding or source code.

Use research to improve information architecture and visual communication.

AniRescue must remain its own design.

---

## 34. Responsive Design

Target:

    ~375px mobile
    ~768px tablet
    ~1440px desktop

Do not simply hide desktop content on mobile.

Reorganize it.

The unified navigation Menu should work on all screen sizes.

The old mobile bottom navigation should remain removed.

---

## 35. Accessibility

Audit:

- visible form labels
- keyboard navigation
- focus states
- contrast
- alt text
- ARIA labels
- disabled states
- error messages
- icon-only button labels
- reduced motion

The navigation menu must have:

- aria-expanded
- aria-controls
- accessible label

---

## 36. Error Handling

Important API calls should handle:

- loading
- success
- empty
- error
- retry where useful

Avoid:

    catch(() => {})

unless there is a deliberate reason.

Never expose raw stack traces to users.

---

## 37. Known Important Backend Hardening

Already completed in the project history:

- login account enumeration prevention
- notification failure no longer resets cases
- worker image URL restriction to Cloudinary
- NGO jurisdiction enforcement for junk review
- invalid availability check removed from jurisdiction update
- case lifecycle hardening
- RabbitMQ report publishing confirmation/rollback behavior
- notification consumer acknowledgment behavior
- role-scoped dashboard queries
- case detail authorization
- FCM invalid token cleanup

These changes should be preserved.

---

## 38. Important Git History / Branches

Main development work has included backend hardening.

Frontend redesign branch:

    frontend-ux-redesign

This branch was created from the hardened backend work and contains the frontend UX redesign.

Do not rewrite git history.

Do not force push.

Do not reset branches blindly.

Do not delete working history.

User controls final commits/pushes unless explicitly requesting otherwise.

---

## 39. Current Local Working Tree Context

The user has local backend work that is intentionally separate from the remote frontend redesign:

    Backend/src/controllers/cases.controller.js

and:

    Backend/migrations/006_volunteer_active_rescue_guard.sql

The stale files:

    anirescue-current-working.diff
    anirescue-frontend-redesign.patch

were removed because they were old patch snapshots and could not be applied cleanly to the current branch.

Do not recreate or delete the backend hardening changes without checking with the user.

---

## 40. Current Frontend Redesign State

The frontend redesign has moved from a first-pass layout improvement to a second-pass information-architecture improvement.

Completed:

- role-aware navigation
- unified Menu
- mobile bottom navigation removed
- desktop navigation duplication removed
- distinct role URLs
- separate User My Cases workspace
- separate Volunteer workspaces
- separate NGO operational workspaces
- separate Admin case and AI review workspaces
- role-specific visual direction
- rescue-focused gradients and semantic colors
- restrained hover/route motion

Current branch:

    frontend-ux-redesign

---

## 41. What Still Needs Verification

After pulling the latest branch, always run:

    cd Frontend
    npm run build

Then:

    git diff --check

Then manually test:

### USER

    /dashboard
    /dashboard/cases
    /report
    /map
    /profile

### VOLUNTEER

    /volunteer
    /volunteer/cases
    /volunteer/active
    /volunteer/history
    /map
    /profile

### NGO

    /ngo
    /ngo/cases
    /ngo/volunteers
    /verification
    /map
    /profile

### ADMIN

    /admin
    /admin/cases
    /admin/ai-validation
    /report
    /verification
    /map
    /profile

Verify that each page actually feels different and has a different job.

---

## 42. Do Not Accidentally Claim Unsupported Features

Never claim that AniRescue has:

- a global volunteer directory if the API does not expose one
- a notification inbox if there is no GET notification endpoint
- Gemini implementation if Gemini is only planned
- production FCM success without testing it
- fully offline operation without testing it
- automatic emergency dispatch if the actual system requires human assignment
- global NGO access
- unrestricted volunteer access
- AI accuracy beyond what was actually measured

Be precise.

---

## 43. Academic Presentation / Paper Context

The project is intended to be explainable in a college presentation and potentially used for an academic paper.

The architecture should be explainable as:

    React frontend
          |
    Express backend
          |
    PostgreSQL
          |
    RabbitMQ
          |
    Python YOLO worker

Supporting services:

- Firebase/FCM
- Cloudinary
- Neon
- CloudAMQP
- Render
- Firebase Hosting

Planned/future:

- Gemini first-aid/severity assistance

Do not draw diagrams that show unimplemented components as implemented.

---

## 44. AI Handoff Instructions

When a new AI receives this file:

1. Read the entire document before modifying the project.
2. Inspect the actual repository because this document can become stale.
3. Treat the repository as the source of truth for current implementation.
4. Treat this file as architecture/history/context.
5. Do not invent endpoints.
6. Do not invent database tables.
7. Do not create a third application microservice.
8. Do not remove working features without understanding dependencies.
9. Check backend authorization before changing frontend role behavior.
10. Prefer the smallest safe change.
11. Run tests after modifications.
12. Report exactly what was changed.
13. Never claim tests passed unless they were actually run.
14. Never expose or commit secrets.
15. Preserve git history.

---

## 45. Preferred Change Process

For a major change:

### Step 1

Inspect.

### Step 2

Understand the affected frontend/backend/database flow.

### Step 3

Identify:

- problem
- root cause
- files affected
- solution
- side effects

### Step 4

Make the smallest safe change.

### Step 5

Run:

    node --check

for modified backend JavaScript.

Run:

    npm run build

for frontend changes.

Run:

    git diff --check

after changes.

### Step 6

Manually test affected role flows.

### Step 7

Review git diff.

### Step 8

Only then commit if the user wants the commit.

---

## 46. Final Product Goal

The finished AniRescue platform should provide:

    USER
      |
      | report animal
      v
    AI validation
      |
      v
    VALIDATION_PASSED
      |
      +----------------------+
      |                      |
      v                      v
    VOLUNTEER               NGO
      |                      |
      +----------+-----------+
                 |
                 v
             IN_PROGRESS
                 |
                 v
          rescue evidence
                 |
                 v
          RESCUE_COMPLETED
                 |
                 v
        NGO / ADMIN verification
                 |
                 v
              RESOLVED

Alongside:

- authentication
- RBAC
- case lifecycle
- AI processing
- location
- NGO jurisdiction
- volunteer coordination
- notifications
- FCM
- maps
- PWA
- responsive UI
- dark/light mode
- security
- error handling
- accessible UI

The goal is not to make AniRescue bigger.

The goal is to make the existing architecture:

**complete, consistent, secure, stable, understandable, mobile-friendly, and presentation-ready.**


## Latest Frontend + Notification Upgrade — September 2026

The `frontend-ux-redesign` branch now includes a completed in-app notification layer on top of the existing FCM push pipeline.

### Notification API
- `GET /api/notifications?limit=...` — authenticated user's notifications plus unread count.
- `PATCH /api/notifications/:id/read` — marks only the authenticated user's notification as read.
- `PATCH /api/notifications/read-all` — marks all of the authenticated user's notifications as read.

All notification reads are user-scoped in SQL; notification IDs cannot be used to read another user's notification.

### Frontend notification UX
- Persistent notification bell in the main navbar.
- Unread count badge.
- Recent notification dropdown.
- Mark-one-read and mark-all-read actions.
- Full `/notifications` inbox with All/Unread filtering.
- Case notifications link directly to `/cases/:id`.
- PushBridge refreshes the notification UI after foreground/background push events.
- Existing notification permission controls remain in Profile.

### Reporter notification coverage
Reporters can now receive in-app/push updates for:
- AI validation passed.
- AI validation rejected / human review required.
- Case claimed.
- Case released.
- Rescue evidence submitted.
- Completion verified / case resolved.
- Completion rejected.
- Case cancelled.

Volunteer assignment/claim and completion notifications remain supported by the existing event flow.

### Important implementation rule
Do not create a frontend notification feed backed by fake/local data. The notification UI must use the authenticated backend notification API and the existing `notifications` database table.

### Validation note
The GitHub branch was inspected after these changes. Local build execution from this environment is limited because outbound GitHub/DNS access is unavailable, so `npm run build` and runtime tests must be executed on the development machine after pulling the latest branch.
