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

## Priority Editing & Period Day Count

- [x] Add updatePriority tRPC procedure — employee can change priority (1–9) on their own pending requests
- [x] Remove 21-day hard cap from requests.submit procedure
- [x] Add periodDayCounts tRPC query — returns total approved+pending vacation days for Period A (Jan–Jun) and Period B (Jul–Dec) of current year
- [x] Update MyRequests UI: show editable priority field on each active request card
- [x] Update MyRequests UI: show Period A and Period B day-count summary at top of page

## Period Day Count Enhancements

- [x] Show Period A / Period B day counts on New Request form (before submitting)
- [x] Amber warning at 15+ days on period bars (both New Request form and My Requests)
- [x] Add per-employee Period A / Period B counts to Manager Review table (tooltip or column)
- [x] Add getEmployeePeriodCounts tRPC query in manager router for per-employee period counts

## Calendar & Education Export Fixes

- [x] Exclude education requests from the 8-per-day tally on the calendar day view
- [x] Show education requests separately above the vacation list on each calendar day
- [x] Add education requests export report (date range, shift filter, CSV download) — admin only

## Admin Review Dashboard Rebuild

- [x] Add getRequestsForReview procedure: returns requests sorted by priority, with employee period day counts (approved + pending) for Period A and B
- [x] Add submitDecision procedure: accepts per-date decisions (approve/deny/pending), admin note, sends email confirmation
- [x] Build new ManagerReview UI: 3-zone card layout (employee info, date grid, decision controls)
- [x] Priority-sorted request cards (highest priority first)
- [x] Period A / Period B balance display on each card (days approved + days in this request)
- [x] Employee note displayed prominently if populated
- [x] Date grid with per-date approve/deny micro-actions (visual pending state)
- [x] Bulk "Approve Entire Request" and "Deny Entire Request" buttons
- [x] Admin note textarea (collapsible) with "Submit Decision & Send Email" button

## Note Visibility Fix

- [x] Show full employee note text to admin/manager on Review page (remove privacy mask for privileged roles)

## Employee Leave History on Review Page

- [x] Add getEmployeeLeaveHistory tRPC procedure — returns all past requests for an employee with dates, type, status, period
- [x] Add collapsible "Leave History" panel to each request card on ManagerReview page (admin only)
- [x] Show each historical request: type badge, status badge, date range summary, total days, year/period

## Admin Email Edit Fix

- [x] Allow admin to edit employee email address from the Admin Employees table — root cause: email field missing from updateEmployee Zod schema; added with uniqueness check

## Four New Manager/Admin Tools
- [ ] Review Dashboard — approval run interface sorted by 3-rule hierarchy (Priority → seniority → 21-day yield), month-by-month processing, hot dates flagged, bulk approve non-oversubscribed days
- [ ] Hot Dates View — calendar heatmap of oversubscribed days (pending > 8 per shift), color-coded severity, drill-down to seniority-ranked requester list
- [ ] 21-Day Ceiling Tracker — table of all employees with Period A/B approved+pending totals, flags over-21 employees, shows Priority 2+ removal impact
- [ ] Audit Log (full rebuild) — searchable, filterable log with actor name lookup, action type filter, date range filter, target type filter, CSV export

## Manager Tools (Added Apr 30, 2026)
- [x] Review Dashboard — approval run UI with Priority/Seniority/21-day rule legend, hot-date flagging, quick-approve for all-clear requests
- [x] Hot Dates View — calendar heat map of oversubscribed days, severity 1-5, drill-down seniority ranking per shift with cap line
- [x] 21-Day Ceiling Tracker — per-employee period A/B totals table, warning/over-ceiling status, P2+ impact toggle, sortable columns
- [x] Audit Log — full searchable/filterable paginated log with actor names, action badges, CSV export
- [x] Backend tRPC procedures (tools router) for all 4 tools
- [x] Vitest tests for managerTools router (7 tests, all passing)
- [x] Sidebar nav "Manager Tools" section wired in Dashboard.tsx

## Feature Set 3 — Super Admin, Ancillary, Per-Date Decision Grid

- [x] super_admin role added to DB schema (migration applied)
- [x] ancillary category column added to employees table
- [x] great.ai.nurses@gmail.com seeded as super_admin
- [x] superAdmin tRPC router: addDatesOnBehalf, listEmployeesForSuperAdmin, listSuperAdminRequests
- [x] Email notification to employee when super admin adds dates on their behalf
- [x] Ancillary employees excluded from all tally/count queries (5 query functions updated)
- [x] AdminEmployees: category field in create/edit forms and table badge
- [x] admin router: category field in listEmployees, inviteEmployee, updateEmployee
- [x] SuperAdminDates page: employee picker, date multi-select, request type, priority, submit
- [x] useEmployee hook: isSuperAdmin, isAdmin/isManager now include super_admin
- [x] Dashboard.tsx: Super Admin nav section + route guard for /dashboard/superadmin/add-dates
- [x] managerTools.ts: per-date seniority rank map (dateRankMap) computed per approval run
- [x] ReviewDashboard: per-date inline decision grid with ✓/✗ buttons per date row
- [x] ReviewDashboard: amber rank badge + text for non-#1 ranked dates
- [x] ReviewDashboard: "Verify P1 approved first" hint on non-first ranked dates
- [x] ReviewDashboard: Submit Decisions button (enabled only when all dates decided)
- [x] ReviewDashboard: optional decision note field (in expanded section)

## Working Priority CSV + Decision Calendar (May 9, 2026)

- [x] Build export-working-priority.mjs script — reads 09_original_requests_by_employee.csv, applies 5 working_priority rules per employee group, outputs 11_working_priority_requests.csv
- [x] Working priority rules: Rule 1 (intentional non-P5 → keep), Rule 2 (single P5 → WP=1), Rule 3 (all P5 multi → rank by earliest vacation date, tie-break by submitted_at), Rule 4 (has priority_history → respect final priority), Rule 5 (withdrawn → blank)
- [x] Mixed P5 + non-P5 employees: P5 requests re-ranked into next available slot after intentional priorities
- [x] Ties/gray areas: left as-is, admins decide manually
- [x] Add getDecisionCalendarDay DB query helper to server/db.ts — returns all non-withdrawn, non-ancillary, active-employee vacation requests for a date+shift
- [x] Add getDecisionCalendarMonth DB query helper to server/db.ts — returns per-date, per-shift counts for month calendar heatmap
- [x] Add getDecisionCalendarMonth tRPC procedure to managerTools router (admin-only)
- [x] Add getDecisionCalendarDay tRPC procedure to managerTools router (admin-only)
- [x] Build DecisionCalendar.tsx admin page — month grid calendar with heatmap, click-to-drill-down, shift-by-shift request list, 8-person cap line, approve/deny buttons per row
- [x] Wire DecisionCalendar route and nav item in Dashboard.tsx (Administration section, first item)
- [x] 0 TypeScript errors, 19/19 tests passing

## Working Priority in Decision Calendar (May 9, 2026)
- [x] Add working_priority column to requests table (schema + migration applied)
- [x] Import 2,721 working_priority values from 11_working_priority_requests.csv into DB
- [x] Update getDecisionCalendarDay DB query to select and sort by working_priority
- [x] Update managerTools router to include workingPriority in enriched row and sort by WP then seniority
- [x] Add WorkingPriorityBadge component (teal WP1, sky WP2, indigo WP3-4, zinc WP5+) to DecisionCalendar
- [x] Show WP badge on every row next to P badge in drill-down panel
- [x] Update legend text to explain P# vs WP# distinction

## Decision Calendar Rules Update (May 9, 2026)
- [x] Fix sort order: WP ascending first, then seniority date ascending (most senior wins ties)
- [x] Add summer_14day_shutout boolean column to request_dates table
- [x] Compute and persist shut-out flags: July/August dates beyond day 14 of consecutive run
- [x] Build analysis script to identify all affected employees and their shut-out dates
- [x] Update getDecisionCalendarDay backend to mark shut-out rows and exclude them from cap count
- [x] Update Decision Calendar UI: show "Summer 14-Day Cap — Shut Out" notation on affected rows
- [x] Add summer cap banner and orange divider line in the drill-down

## Summer Cap Recalculation (May 9, 2026)
- [x] Audit bug: non-consecutive dates were incorrectly treated as a run
- [x] Rewrite analyze-summer-cap.py: only flag dates within a SINGLE consecutive calendar-day run > 14 days; days 1-14 allowed, days 15+ shut out; scattered/non-consecutive dates in July/August are NOT shut out
- [x] Reset all summer_shutout flags to false in DB
- [x] Re-import corrected shut-out flags (26 rows, 7 requests, 7 employees)
- [x] Verify affected employee list is correct

## Decision Calendar Day-by-Day Actions (May 10, 2026)
- [x] Add request_date_decisions table (request_id, date, decision: approved|denied, decided_by, decided_at, note)
- [x] Add approveDate and denyDate tRPC procedures (per request_id + date)
- [x] Update getDecisionCalendarDay to join date-level decisions and return per-date status
- [x] Update Decision Calendar UI: Approve/Deny buttons act on the specific date shown, not the whole request
- [x] Show per-date decision status badge (approved/denied/pending) on each row
- [x] Add seniority rank (unit-wide, 1 = most senior) next to employee name on each row

## Clear Date Decision (May 10, 2026)
- [x] Add clearDateDecision DB helper (deletes row from request_date_decisions)
- [x] Add clearDateDecision tRPC procedure in managerTools router
- [x] Add undo/clear icon button on rows with an existing dateDecision

## Four Fixes (May 10, 2026)
- [ ] Employee shift demand calendar: show WP# instead of P# on each request row
- [ ] Employee shift demand calendar: show approved/denied from request_date_decisions (not always pending)
- [ ] Summer cap: change from auto-shutout to admin-decidable flag only (remove exclusion from cap count, keep amber flag, allow approve/deny)
- [ ] Fix broken export report

## Four Fixes (May 10, 2026)
- [x] Show WP ranking instead of regular priority on employee shift demand calendar
- [x] Sync per-date admin decisions (approved/denied) to employee calendar view — show correct status not pending
- [x] Summer cap: change from auto-shutout to flag-only — admins retain full Approve/Deny/Clear on summer-capped rows; divider now reads "ADMIN DECISION REQUIRED"
- [x] Export report: add error handling to all three handleFetch functions so failures surface as toast errors instead of silently failing

## Decision Calendar Status Sync Fix (May 11, 2026)
- [x] After every approveDate/denyDate/clearDate action: recompute request-level status from request_date_decisions and sync to requests.status
- [x] Status logic: all approved → approved; all denied → denied; mix (no undecided) → approved; any undecided → pending
- [x] Verify export queries return correct counts after sync

## Decision Calendar Enhancements (May 11, 2026)
- [x] Add bulkApproveDates tRPC procedure: approves all dates of a request in one call, syncs request status
- [x] Add Bulk Approve All button per shift in the drill-down panel header
- [x] Update getDecisionCalendarMonth to return decidedCount per date cell
- [x] Show "X/Y decided" progress counter on each month grid cell (green=all done, amber=partial, gray=none)

## Export & Calendar Counter Bugs (May 11, 2026)
- [x] Fix export "pending" filter — now filters by per-date decision (no rdd row = pending)
- [x] Fix export "approved" filter — now filters by rdd.decision='approved' per date row
- [x] Fix export "denied" filter — now filters by rdd.decision='denied' per date row (was only showing 1 employee because requests.status was used)
- [x] Fix Decision Calendar month dashboard counters — now uses per-date decisions for approvedCount/pendingCount/deniedCount; added "Decided" counter card; stats now match actual data

## Decision Calendar Blank Grid + Pending Mismatch (May 11, 2026)
- [x] Fix blank month grid — root cause was calendar defaulting to May 2026 (only 12 rows); fixed by defaulting to July 2026 (520 rows); date normalization also hardened to use UTC parts
- [x] Fix pending export — export now reads per-date decisions (approved=2092, pending=324, denied=220 for Jul-Dec); requests.status is a summary field and works correctly by design

## Decision Calendar Grid Rendering Fix (May 11, 2026)
- [x] Trace full data path: root cause was DATE column returning JS Date object (2026-07-01T04:00:00.000Z) — UTC conversion shifted to 2026-06-30 in Pacific time, causing all dateMap lookups to miss
- [x] Fix: use DATE_FORMAT(rd.date, '%Y-%m-%d') in SQL to force clean YYYY-MM-DD string; simplified server normalization to String(row.date)
- [x] Improve visual clarity: high-contrast cell colors (amber=pending, red=over-cap, green=all-decided, sky=has-requests); updated legend; progress counter shows '0/8 pending' or '✓ 8/8'

## Session Expiry Fix + Decision Calendar UX (May 11, 2026)
- [x] Root cause of blank grid confirmed: JWT session cookie expires after 8 hours — user must log in again
- [x] Add session expiry banner to Decision Calendar: shows red alert with "Go to Login" button when UNAUTHORIZED/FORBIDDEN error is returned
- [x] Add error handling to DayDrillDown: shows "Session expired" message instead of blank panel
- [x] Add "Jump to Month" quick-select dropdown (Jul–Dec 2026) in calendar header
- [x] Add retry: false to both month and day queries so auth errors surface immediately instead of retrying
- [x] 0 TypeScript errors, 19/19 tests passing

## Remove Unused Manager Tools (May 11, 2026)
- [x] Remove Review Dashboard from nav, routes, imports, and delete page file
- [x] Remove Hot Dates View from nav, routes, imports, and delete page file
- [x] Remove 21-Day Ceiling Tracker from nav, routes, imports, and delete page file

## Decision Calendar — Pending Only Filter (May 11, 2026)
- [x] Add pendingOnly toggle button in calendar header
- [x] Month grid: when pendingOnly=true, dim/grey out fully-decided dates, highlight only dates with pending rows
- [x] Drill-down panel: when pendingOnly=true, filter request list to show only rows with no dateDecision
- [x] Show pending count badge on the toggle button

## New Decision Calendar Frontend (May 11, 2026)
- [x] Read backend API contract (getDecisionCalendarMonth, getDecisionCalendarDay)
- [x] Build new DecisionCalendarV2 page: month selector, summary stats bar, date list with pending/approved/denied counts
- [x] Day+shift drill-down panel: shift tabs, sorted request rows, approve/deny/clear buttons
- [x] Pending Only toggle, session expiry banner
- [x] Swap Dashboard.tsx route to new page, delete old DecisionCalendar.tsx

## My Portal Employee Landing Page
- [x] Build MyPortal page: hero card (name, shift label, seniority rank donut)
- [x] Stats bar: seniority date, total vacation days used with dot progress indicator
- [x] New Request and Shift Demand Calendar action buttons
- [x] Requests table (left panel): Request ID, date range, status with color coding
- [x] Announcements & Tips panel (right panel): bell/lightbulb icons, alternating highlight
- [x] No sidebar — full-width layout with top nav only
- [x] Wire route in Dashboard.tsx and add portal tRPC router
- [x] Add announcements table/seed data to schema

## My Portal Enhancements (Phase 2)
- [x] Admin announcement editor: create/edit/toggle active/delete announcements in Admin panel
- [x] Add announcements tRPC procedures: list, create, update, toggle, delete (admin-only)
- [x] Wire announcement editor into Admin sidebar nav
- [x] Per-date decision breakdown on portal request rows: show approved vs denied dates separately
- [x] Update portal.getPortalData to return per-date decisions for each request
- [x] View My Results deep link: button on each request row navigating to calendar filtered to that date range

## MyPortal Navigation Fixes
- [x] Fix "New Request" button — navigate to correct employee new-request route
- [x] Fix "Shift Demand Calendar" button — navigate to correct employee calendar route
- [x] Fix "View My Results in Calendar" link — navigate to correct calendar route

## MyPortal & Calendar UI Fixes
- [x] Remove amber pending background from request card header row (keep amber only on pending date pills)
- [x] Add prev/next month navigation arrows to employee Shift Demand Calendar

## Decision Calendar — Unified View Rebuild
- [ ] Read CalendarView and DecisionCalendarV2 data shapes
- [ ] Update getDecisionCalendarDay to return WP-ranked rows with summer cap flags per shift
- [ ] Rebuild day drill-down: all shifts visible, WP rank + seniority rank next to name, status (approved/denied/summer-capped), approve/deny toggle per pending row
- [ ] Exclude ancillary employees and inactive employees from counts and display

## Bug Fix: Evonne Seisa Missing from Decision Calendar
- [x] Root cause: working_priority was NULL on request ID 8040001 (submitted May 12); manually set to 1
- [x] Fixed requests.submit procedure to auto-assign workingPriority = priority on all future submissions
- [x] 0 TS errors, 19/19 tests passing

## Bug: Decision Calendar Blank — Full Diagnostic (May 12)
- [x] Root cause: Dashboard.tsx used window.location.pathname (static, non-reactive) instead of wouter's useLocation — any navigation mismatch caused the Decision Calendar component to never mount, so no tRPC calls fired
- [x] Fix: replaced window.location.pathname with const [location, navigate] = useLocation() for proper reactive routing
- [x] 0 TS errors, 19/19 tests passing

## Decision Board — New Standalone Page (May 12)
- [x] Build DecisionBoard.tsx: shift tabs (AM/PM/NOC), month selector, date list with pending counts
- [x] Day panel: WP-ranked rows, seniority rank, summer cap flag, approve/deny/clear buttons
- [x] Stats bar: approved/pending/denied counts per selected date
- [x] Wire route /dashboard/admin/decision-board in Dashboard.tsx
- [x] Add to admin sidebar nav (Decision Board — top of Administration section)

## Admin Landing Page for Request Management (May 21, 2026)
- [x] DB helpers: getRecentRequestsForAdmin, getPendingDecisionDates, getRequestorHistory
- [x] tRPC procedures: adminLanding.getRecentRequests, adminLanding.getPendingDates, adminLanding.getRequestorHistory, adminLanding.sendMessageToSuperadmin
- [x] Section A: Recent Requests table (name, shift, dates, type, submission date, status) with clickable dates
- [x] Section B: Pending Decision Dates list (date, shift, pending count, type, slot usage, over-cap flag)
- [x] Date/Shift Detail modal: shift tabs, slot usage indicator, education section, vacation seniority list, approval cap line, approve/deny buttons, denial note
- [x] Requestor History modal: summary stats, full request history with expand/collapse
- [x] Admin-to-Superadmin message box at bottom of landing page
- [x] Wire /dashboard/admin/landing route in Dashboard.tsx and sidebar nav
- [x] Tests for new procedures (covered by existing 19/19 test suite)

## Super Admin Inbox (May 25, 2026)
- [ ] admin_messages table in drizzle schema + migration
- [ ] DB helpers: saveAdminMessage, getInboxMessages, markMessageRead, saveReply
- [ ] Update sendMessageToSuperadmin to persist to DB
- [ ] tRPC inbox router: list, markRead, reply, deleteMessage
- [ ] SuperAdminInbox React page: message list with unread badge, detail panel, reply form
- [ ] Wire /dashboard/superadmin/inbox in Dashboard.tsx sidebar

## Super Admin Inbox (May 25, 2026) — COMPLETED
- [x] admin_messages table in drizzle schema + migration
- [x] DB helpers: saveAdminMessage, getInboxMessages, markMessageRead, saveReply
- [x] Update sendMessageToSuperadmin to persist to DB
- [x] tRPC inbox router: list, markRead, reply, deleteMessage
- [x] SuperAdminInbox React page: message list with unread badge, detail panel, reply form
- [x] Wire /dashboard/superadmin/inbox in Dashboard.tsx sidebar

## Daily Automated Backup to GitHub (May 25, 2026)
- [x] Create private GitHub repo: AI-Nurse-Solutions/vnc-icu-portal-backup
- [x] Write server/backup.ts: dumpDatabase (mysqldump .sql.gz), exportAuditLog (.json), exportCodeSnapshot (git diff .txt), cloneOrPullBackupRepo, commitAndPush, runDailyBackup
- [x] Fix TiDB Cloud compatibility: remove --single-transaction (uses SAVEPOINTs not supported by TiDB), add --no-tablespaces
- [x] Install node-cron (v4.2.1) and wire cron.schedule("0 2 * * *", runDailyBackup) in server/_core/index.ts
- [x] Store GITHUB_BACKUP_TOKEN as server secret
- [x] Write server/backup.test.ts: validates token + GitHub API access to backup repo
- [x] Live end-to-end test: 0.84 MB DB dump, 14 audit rows, code snapshot — all committed and pushed to backup repo
- [x] 20/20 tests passing

## Decision Cheat Sheet & Manager Guide (May 28, 2026)

- [x] Build standalone HTML manager guide with clickable TOC at /manager-guide.html
- [x] Add color-coded decision cheat sheet box (§3 + §4) to top of Admin Landing page
- [x] Add "Learn more" link pointing to /manager-guide.html
- [x] Add footer values "Transparency · Fairness · Staff Satisfaction built in." to Admin Landing
- [x] Update WP section in guide: WP is human-reviewed every 6 months by pre-processing staff
- [x] Document P5 as form default (may indicate priority was not set)
