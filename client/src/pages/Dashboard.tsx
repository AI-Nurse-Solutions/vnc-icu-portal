import { useEffect } from "react";
import { useLocation } from "wouter";
import { useEmployee } from "@/hooks/useEmployee";
import { useTheme } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Calendar, CalendarDays, ClipboardList, Settings, Users, FileDown,
  LogOut, HeartPulse, BarChart3, Shield, Menu, X, Bell,
  Star, Sun, Moon
} from "lucide-react";
import { useState } from "react";
import MyRequests from "./employee/MyRequests";
import NewRequest from "./employee/NewRequest";
import CalendarView from "./employee/CalendarView";
import ManagerReview from "./manager/ManagerReview";
import PolicySettings from "./manager/PolicySettings";
import ExportData from "./manager/ExportData";

import AdminEmployees from "./admin/AdminEmployees";
import AdminAuditLog from "./admin/AdminAuditLog";
import AdminImport from "./admin/AdminImport";
import AuditLog from "./admin/AuditLog";
import SuperAdminDates from "./superadmin/SuperAdminDates";
import DecisionCalendarV2 from "./admin/DecisionCalendarV2";

/** Guard component — shows "Access Denied" if the user lacks the required role */
function RoleGuard({ allowed, children }: { allowed: boolean; children: React.ReactNode }) {
  if (!allowed) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <Shield className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-foreground font-medium">Access Denied</p>
          <p className="text-muted-foreground text-sm">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function NavItem({ href, icon: Icon, label, active, onClick }: {
  href: string; icon: any; label: string; active: boolean; onClick?: () => void;
}) {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => { navigate(href); onClick?.(); }}
      className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
        active
          ? "bg-primary/15 text-primary border border-primary/30"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
      }`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${active ? "text-primary" : "group-hover:text-foreground"}`} />
      <span>{label}</span>
    </button>
  );
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  // Use window.location.pathname for reliable full-path matching in nested wouter routes
  const location = typeof window !== 'undefined' ? window.location.pathname : '/';
  const { employee, isLoading, isManager, isAdmin, isSuperAdmin } = useEmployee();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const utils = trpc.useUtils();

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      // Clear the auth cache so the next login shows the correct user
      await utils.auth.me.invalidate();
      navigate("/login");
    },
  });

  useEffect(() => {
    if (!isLoading && !employee) {
      navigate("/login");
    }
  }, [isLoading, employee]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <HeartPulse className="w-8 h-8 text-primary animate-pulse" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!employee) return null;

  // ── Employee lockout ─────────────────────────────────────────────────────────
  // Only employee and ancillary roles are blocked. Managers, admins, and
  // super_admins continue to have full access.
  if (employee.role === "employee" || employee.role === "ancillary") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-xl w-full text-center space-y-8">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <HeartPulse className="w-10 h-10 text-primary" />
            </div>
          </div>

          {/* Portal name */}
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">VNC ICU Vacation Request Portal</h1>
            <p className="text-sm text-muted-foreground mt-1">Van Ness Campus &middot; Critical Care Unit</p>
          </div>

          {/* Lockout message */}
          <div className="rounded-xl border border-primary/40 bg-primary/5 px-8 py-8 shadow-sm">
            <p className="text-xl font-bold text-foreground leading-relaxed">
              Review and deliberation of all requests are on-going, Validation of everyone&apos;s seniority dates are being done first. Thank you for your patience.
            </p>
          </div>

          {/* Sign out */}
          <button
            onClick={() => logoutMutation.mutate()}
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const employeeNav = [
    { href: "/dashboard", label: "Calendar View", icon: Calendar },
    { href: "/dashboard/my-requests", label: "My Requests", icon: ClipboardList },
    { href: "/dashboard/new-request", label: "New Request", icon: Bell },
  ];

  const managerNav = [
    { href: "/dashboard/manager/review", label: "Review Requests", icon: BarChart3 },
    { href: "/dashboard/manager/export", label: "Export Data", icon: FileDown },
    { href: "/dashboard/manager/policy", label: "Policy Settings", icon: Settings },
  ];

  // ─── Tools section (manager + admin) ───────────────────────────────────────
  const toolsNav = [
    { href: "/dashboard/tools/audit-log", label: "Audit Log", icon: Shield },
  ];

  const adminNav = [
    { href: "/dashboard/admin/decision-calendar", label: "Decision Calendar", icon: CalendarDays },
    { href: "/dashboard/admin/employees", label: "Employees", icon: Users },
    { href: "/dashboard/admin/import", label: "CSV Import", icon: FileDown },
    { href: "/dashboard/admin/audit", label: "Audit Log (Legacy)", icon: Shield },
  ];

  const superAdminNav = [
    { href: "/dashboard/superadmin/add-dates", label: "Add Dates on Behalf", icon: Star },
  ];

  // All known routes for "not found" fallback
  const allRoutes = [
    "/dashboard", "/dashboard/my-requests", "/dashboard/new-request",
    "/dashboard/manager/review", "/dashboard/manager/export", "/dashboard/manager/policy",
    "/dashboard/tools/audit-log",
    "/dashboard/admin/decision-calendar",
    "/dashboard/admin/employees", "/dashboard/admin/import", "/dashboard/admin/audit",
    "/dashboard/superadmin/add-dates",
  ];

  const Sidebar = ({ onClose }: { onClose?: () => void }) => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-border/40">
        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
          <HeartPulse className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground truncate">VNC ICU Portal</p>
          <p className="text-xs text-muted-foreground truncate">Van Ness Campus</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">My Portal</p>
          <div className="space-y-1">
            {employeeNav.map(n => (
              <NavItem key={n.href} {...n} active={location === n.href} onClick={onClose} />
            ))}
          </div>
        </div>

        {isManager && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">Management</p>
            <div className="space-y-1">
              {managerNav.map(n => (
                <NavItem key={n.href} {...n} active={location === n.href} onClick={onClose} />
              ))}
            </div>
          </div>
        )}

        {isManager && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">
              Manager Tools
            </p>
            <div className="space-y-1">
              {toolsNav.map(n => (
                <NavItem key={n.href} {...n} active={location === n.href} onClick={onClose} />
              ))}
            </div>
          </div>
        )}

        {isAdmin && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">Administration</p>
            <div className="space-y-1">
              {adminNav.map(n => (
                <NavItem key={n.href} {...n} active={location === n.href} onClick={onClose} />
              ))}
            </div>
          </div>
        )}

        {isSuperAdmin && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2 flex items-center gap-1.5">
              <Star className="w-3 h-3 text-yellow-400" /> Super Admin
            </p>
            <div className="space-y-1">
              {superAdminNav.map(n => (
                <NavItem key={n.href} {...n} active={location === n.href} onClick={onClose} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* User footer */}
      <div className="border-t border-border/40 px-3 py-4">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/40 mb-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary">{employee.firstName.charAt(0)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{employee.firstName} {employee.lastName}</p>
            <p className="text-xs text-muted-foreground truncate capitalize">{employee.role} · {employee.shift}</p>
            {employee.isVerified === false && (
              <span className="inline-flex items-center gap-0.5 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                ⚠ Account Pending Verification
              </span>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary/60 mb-1"
          onClick={toggleTheme}
        >
          {theme === "dark" ? (
            <><Sun className="w-4 h-4" /> Light Mode</>
          ) : (
            <><Moon className="w-4 h-4" /> Dark Mode</>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={() => logoutMutation.mutate()}
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-sidebar border-r border-sidebar-border">
        <Sidebar />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-sidebar border-r border-sidebar-border flex flex-col">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-card/80 backdrop-blur-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <Menu className="w-5 h-5" />
          </button>
          <HeartPulse className="w-5 h-5 text-primary" />
          <span className="text-sm font-semibold text-foreground">VNC ICU Portal</span>
        </header>

        {/* Page content — routes use location directly for reliable matching */}
        <main className="flex-1 overflow-y-auto">
          {location === "/dashboard" && <CalendarView />}
          {location === "/dashboard/my-requests" && <MyRequests />}
          {location === "/dashboard/new-request" && <NewRequest />}
          {location === "/dashboard/manager/review" && (
            <RoleGuard allowed={isManager}><ManagerReview /></RoleGuard>
          )}
          {location === "/dashboard/manager/export" && (
            <RoleGuard allowed={isManager}><ExportData /></RoleGuard>
          )}
          {location === "/dashboard/manager/policy" && (
            <RoleGuard allowed={isManager}><PolicySettings /></RoleGuard>
          )}
          {/* ─── Manager Tools ────────────────────────────────────────────── */}
          {location === "/dashboard/tools/audit-log" && (
            <RoleGuard allowed={isManager}><AuditLog /></RoleGuard>
          )}
           {/* ─── Admin ────────────────────────────────────────────────────── */}
          {location === "/dashboard/admin/decision-calendar" && (
            <RoleGuard allowed={isAdmin}><DecisionCalendarV2 /></RoleGuard>
          )}
          {location === "/dashboard/admin/employees" && (
            <RoleGuard allowed={isAdmin}><AdminEmployees /></RoleGuard>
          )}
          {location === "/dashboard/admin/import" && (
            <RoleGuard allowed={isAdmin}><AdminImport /></RoleGuard>
          )}
          {location === "/dashboard/admin/audit" && (
            <RoleGuard allowed={isAdmin}><AdminAuditLog /></RoleGuard>
          )}
          {/* ─── Super Admin ─────────────────────────────────────────────── */}
          {location === "/dashboard/superadmin/add-dates" && (
            <RoleGuard allowed={isSuperAdmin ?? false}><SuperAdminDates /></RoleGuard>
          )}
          {!allRoutes.includes(location) && (
            <div className="flex items-center justify-center h-full min-h-64">
              <p className="text-muted-foreground">Page not found</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
