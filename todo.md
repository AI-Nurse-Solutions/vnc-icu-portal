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
