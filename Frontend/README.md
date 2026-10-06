# AniRescue Frontend

The AniRescue frontend is a React 19 + Vite progressive web app for animal rescue reporting and role-based rescue coordination.

## Roles

- **USER** — submit and track rescue reports
- **VOLUNTEER** — manage availability, receive nearby rescue notifications, claim/release cases, and submit rescue evidence
- **NGO** — manage jurisdiction, coordinate volunteers, dispatch cases, and verify rescue completion
- **ADMIN** — global case oversight, AI retry/review, account management, and administrative controls

## Core frontend features

- Responsive dark/light rescue-focused UI
- PWA installation support
- Browser authentication using secure cookies
- CSRF protection for state-changing API requests
- Offline report storage in IndexedDB
- Automatic foreground retry when connectivity returns
- Cloudinary direct image upload through short-lived API signatures
- Firebase Cloud Messaging browser notifications
- Role-specific dashboards and case views
- Global volunteer availability/location presence
- Accessible responsive notifications and confirmation dialogs

## Development

```bash
npm ci
npm run dev
```

## Verification

```bash
npm run lint
npm run build
npm run e2e
```

The browser E2E suite uses the Playwright CLI pinned by the project configuration. CI installs Chromium and runs the browser smoke tests.

## API configuration

Set `VITE_API_URL` to the backend API base URL when the API is hosted separately.

Do not put backend secrets in Vite environment variables. Frontend environment variables are publicly shipped to the browser.
