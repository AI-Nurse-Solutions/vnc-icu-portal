# VNC ICU Vacation Request Portal — TODO

## Phase 2: Database Schema & Foundation
- [x] Extend drizzle schema with all PRD tables (employees, requests, request_dates, blackout_dates, submission_deadlines, config, audit_log)
- [x] Generate and apply migrations
- [x] Install nodemailer for Gmail SMTP
- [x] Set up email utility (SMTP helper)
- [x] Seed synthetic demo data (25 employees, 15 requests, blackout dates, config)

## Phase 3: Authentication
- [x] Custom email/password login (not Manus OAuth)
- [x] 6-digit OTP generation and email delivery via Gmail SMTP
- [x] OTP expiration (10 min), 5-attempt lockout (15 min)
- [x] Password reset via email token
- [x] Admin invite flow (email invitation with activation link)
- [x] Session management (JWT cookie)
- [x] Role-based access control (employee, manager, admin)

## Phase 4: Employee Portal
- [x] Night-shift dark theme (index.css, App.tsx)
- [x] Calendar view with per-shift demand color coding (green/yellow/red + text labels)
- [x] Blackout date display (non-selectable, labeled)
- [x] Day drill-down: seniority-ranked list (First Name + Last Initial), cap cutoff line
- [x] Request submission form (vacation/education, date selection, continuous/intermittent, private comment)
- [x] 21-day/6-month vacation validation
- [x] My Requests page with withdrawal action
- [x] Email confirmation on submission and withdrawal

## Phase 5: Manager Dashboard
- [x] Manager review board with shift/type/status filters
- [x] Seniority-ranked list with full names and private comments
- [x] Inside-cap vs outside-cap visual separator (dashed cutoff line)
- [x] Approve/deny actions with optional manager note
- [x] Manager notification on approved-request withdrawal
- [x] CSV export (date range, shift, type filters)
- [x] Configuration panel (per-shift caps, submission deadlines, blackout dates, color thresholds)

## Phase 6: Admin Panel
- [x] Employee CSV import with validation and error reporting
- [x] User management (invite, edit, deactivate)
- [x] Full audit log view
- [x] Email invitation flow

## Phase 7: Polish & Tests
- [x] Animations (fade-in, slide-up, staggered lists)
- [x] prefers-reduced-motion support
- [x] WCAG text labels on all color-coded indicators
- [x] 12 Vitest unit tests passing
- [x] Final checkpoint and delivery

## Bug Fixes

- [x] Fix invalid credentials error on login — switched drizzle DB connection from single string URL to mysql2 createPool for reliable concurrent connections
- [ ] Fix persistent invalid credentials — deep trace browser login flow
- [x] Fixed SMTP env var mismatch (SMTP_PASSWORD vs SMTP_PASS) — OTP emails now deliver via Gmail
- [x] Updated admin account email to great.ai.nurses@gmail.com for real OTP delivery
- [x] Disabled MFA/OTP — login now issues session directly after email + password check

## Calendar Component Enhancement

- [x] Build ICUDatePicker component: drag-to-select continuous ranges + click-to-toggle multi-select
- [x] Add mode toggle (Range / Multi-select) with keyboard shortcut hint
- [x] Enforce blackout dates and policy limits inside the component
- [x] Pre-submission summary list showing all selected dates with remove buttons
- [x] Output clean date array to NewRequest form on submit
- [x] Fixed invalid credentials — root cause was missing cookie-parser middleware; req.cookies was always undefined so session JWT was never read back after login
- [x] Fixed unclickable manager/admin nav items — moved from conditional route registration to always-registered routes with RoleGuard components inside each page
- [x] Show employee seniority date on MyRequests page — displayed in employee info card at top
- [x] Show priority number next to each request on MyRequests page — shows shift-wide seniority rank (#N of M in shift)
- [x] Fixed 404 on all admin/manager nav pages — wouter wildcard route syntax was wrong; fixed with regex route `path={/^\/dashboard(\/.*)?$/}` in App.tsx; removed duplicate useLocation hook that caused hooks violation
- [x] Added request priority dropdown to New Request form (Routine / Preferred / Critical) — DB migration applied, router updated, color-coded dropdown with contextual helper text
- [x] Changed priority to numeric rank 1-9 dropdown on New Request form (1=highest, 9=lowest, color-coded)
- [x] Calendar day-click drill-down: shows per-shift applicant list (First Name, Last Initial) with seniority rank and cap cutoff line; mobile panel below calendar
- [x] Added pending/approved/denied/withdrawn status checkboxes to CSV export — backend updated to accept statuses array, UI has toggle checkboxes with color coding, filename reflects selected statuses
- [x] Fixed AdminEmployees form: moved EmployeeForm outside parent component to prevent re-render/focus loss on each keystroke
- [x] Fixed initial password: inviteEmployee router now accepts password, hashes with bcrypt, sets isActive=true immediately when password is provided

## Role & User Display Fixes

- [x] Hide manager/admin nav items (Review Requests, Export Data, Policy Settings, Employees, CSV Import, Audit Log) from employees
- [x] Fix logged-in user display — show actual authenticated user's name/role, not hardcoded "admin" (root cause: stale auth.me cache; fixed by invalidating on login and logout)

## Self-Signup Feature

- [x] Add signup tRPC procedure (publicProcedure): accepts firstName, lastName, email, employeeNumber, shift, password — creates employee with role=employee, isActive=true, no OTP/invite
- [x] Add "Create Account" tab to Login page with signup form (name, email, employee number, shift selector, password + confirm)
- [x] Validate: email uniqueness, employee number uniqueness, password min 8 chars
- [x] On successful signup, auto-login (issue JWT cookie) and redirect to /dashboard

## Simplified Signup + Unverified Badge

- [x] Remove employeeNumber and seniorityDate from signup form (employees don't enter these)
- [x] Auto-assign placeholder employee number on signup (e.g. TEMP-{nanoid(6)}) so DB constraint is satisfied
- [x] Add isVerified boolean column to employees table (false by default on self-signup, true when admin sets official employeeNumber + seniorityDate)
- [x] Show "Unverified" badge on employee rows in Admin Employees table where isVerified=false
- [x] Add inline edit in Admin Employees table for employeeNumber and seniorityDate fields (admin/manager only)
- [x] Mark employee as verified (isVerified=true) when admin saves official employeeNumber + seniorityDate
- [x] Show "Unverified" indicator in sidebar user profile for the employee themselves so they know their account is pending verification

## Deadline Fix & Data Cleanup

- [x] Fix submission deadline setting (save/load in Policy Settings) — root cause: shadcn Input type=date not firing onChange; replaced with native input elements
- [x] Delete all employee-role accounts, preserve admin and managers — 29 employees + their requests/audit logs deleted; 4 accounts remain (1 admin, 3 managers)

## Email Confirmations for Request Events

- [ ] Add sendRequestSubmittedEmail — sent to employee on new request submission
- [ ] Add sendRequestApprovedEmail — sent to employee when manager approves
- [ ] Add sendRequestDeniedEmail — sent to employee when manager denies
- [ ] Add sendRequestCancelledEmail — sent to employee when request is cancelled
- [ ] Wire all four emails into the request mutation procedures (submit, approve, deny, cancel)

## Resend Confirmation Feature

- [x] Add resendConfirmation tRPC procedure in requests router — fetches request + dates, sends appropriate email based on current status
- [x] Add "Resend Confirmation" button to each request card on My Requests page
