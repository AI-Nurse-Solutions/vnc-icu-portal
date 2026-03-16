import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Users, Loader2, Plus, Edit2, Trash2, Search, ShieldCheck, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";

type Employee = {
  id: number;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  shift: string;
  role: string;
  seniorityDate: string;
  isActive: boolean;
  isVerified: boolean;
};

type FormState = {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  shift: "AM" | "PM" | "NOC";
  role: "employee" | "manager" | "admin";
  seniorityDate: string;
  password: string;
};

const emptyForm: FormState = {
  employeeNumber: "", firstName: "", lastName: "", email: "",
  shift: "AM", role: "employee", seniorityDate: "", password: "",
};

// ─── EmployeeForm is defined OUTSIDE the parent component ────────────────────
type EmployeeFormProps = {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onSave: (data: FormState) => void;
  isPending: boolean;
  showPassword: boolean;
};

function EmployeeForm({ form, setForm, onSave, isPending, showPassword }: EmployeeFormProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs mb-1 block">First Name</Label>
          <Input
            value={form.firstName}
            onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))}
            className="bg-input border-border/60"
            placeholder="e.g. Henry"
          />
        </div>
        <div>
          <Label className="text-xs mb-1 block">Last Name</Label>
          <Input
            value={form.lastName}
            onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))}
            className="bg-input border-border/60"
            placeholder="e.g. Domondon"
          />
        </div>
      </div>
      <div>
        <Label className="text-xs mb-1 block">Email</Label>
        <Input
          type="email"
          value={form.email}
          onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
          className="bg-input border-border/60"
          placeholder="employee@hospital.org"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs mb-1 block">Employee #</Label>
          <Input
            value={form.employeeNumber}
            onChange={e => setForm(p => ({ ...p, employeeNumber: e.target.value }))}
            className="bg-input border-border/60"
            placeholder="e.g. 10042"
          />
        </div>
        <div>
          <Label className="text-xs mb-1 block">Seniority Date</Label>
          <Input
            type="date"
            value={form.seniorityDate}
            onChange={e => setForm(p => ({ ...p, seniorityDate: e.target.value }))}
            className="bg-input border-border/60"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs mb-1 block">Shift</Label>
          <Select value={form.shift} onValueChange={v => setForm(p => ({ ...p, shift: v as any }))}>
            <SelectTrigger className="bg-input border-border/60"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover border-border/60">
              <SelectItem value="AM">AM</SelectItem>
              <SelectItem value="PM">PM</SelectItem>
              <SelectItem value="NOC">NOC</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">Role</Label>
          <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v as any }))}>
            <SelectTrigger className="bg-input border-border/60"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover border-border/60">
              <SelectItem value="employee">Employee</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {showPassword && (
        <div>
          <Label className="text-xs mb-1 block">Initial Password</Label>
          <Input
            type="password"
            value={form.password}
            onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
            className="bg-input border-border/60"
            placeholder="Min 8 characters (leave blank to send invite email)"
          />
          <p className="text-xs text-muted-foreground mt-1">
            If set, the employee can log in immediately. Leave blank to send an invite email for self-setup.
          </p>
        </div>
      )}
      <Button
        onClick={() => onSave(form)}
        disabled={isPending}
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Save Employee
      </Button>
    </div>
  );
}

// ─── Verify dialog: admin sets official employee number + seniority date ──────
type VerifyFormState = { employeeNumber: string; seniorityDate: string };

function VerifyEmployeeDialog({
  employee,
  onClose,
}: {
  employee: Employee;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [verifyForm, setVerifyForm] = useState<VerifyFormState>({
    employeeNumber: employee.employeeNumber.startsWith("TEMP-") ? "" : employee.employeeNumber,
    seniorityDate: employee.seniorityDate ? employee.seniorityDate.split("T")[0] : "",
  });

  const verifyMutation = trpc.admin.verifyEmployee.useMutation({
    onSuccess: () => {
      toast.success(`${employee.firstName} ${employee.lastName} has been verified.`);
      utils.admin.listEmployees.invalidate();
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent className="bg-card border-border/60">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Verify Employee
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-1 mb-4 p-3 bg-secondary/30 rounded-lg">
        <p className="text-sm font-medium text-foreground">{employee.firstName} {employee.lastName}</p>
        <p className="text-xs text-muted-foreground">{employee.email}</p>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Enter the official employee number and seniority date. This will mark the account as verified and replace the temporary placeholder.
      </p>
      <div className="space-y-3">
        <div>
          <Label className="text-xs mb-1 block">Official Employee Number</Label>
          <Input
            value={verifyForm.employeeNumber}
            onChange={e => setVerifyForm(p => ({ ...p, employeeNumber: e.target.value }))}
            className="bg-input border-border/60"
            placeholder="e.g. 10042"
          />
        </div>
        <div>
          <Label className="text-xs mb-1 block">Official Seniority Date</Label>
          <Input
            type="date"
            value={verifyForm.seniorityDate}
            onChange={e => setVerifyForm(p => ({ ...p, seniorityDate: e.target.value }))}
            className="bg-input border-border/60"
          />
        </div>
        <Button
          onClick={() => verifyMutation.mutate({
            id: employee.id,
            employeeNumber: verifyForm.employeeNumber,
            seniorityDate: verifyForm.seniorityDate,
          })}
          disabled={verifyMutation.isPending || !verifyForm.employeeNumber || !verifyForm.seniorityDate}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {verifyMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <ShieldCheck className="w-4 h-4 mr-2" />
          Verify & Save
        </Button>
      </div>
    </DialogContent>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────
export default function AdminEmployees() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [verifyEmployee, setVerifyEmployee] = useState<Employee | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [filterUnverified, setFilterUnverified] = useState(false);

  const { data: employees, isLoading } = trpc.admin.listEmployees.useQuery();

  const createMutation = trpc.admin.inviteEmployee.useMutation({
    onSuccess: (data) => {
      if (data.activated) {
        toast.success("Employee added and activated. They can log in immediately.");
      } else {
        toast.success("Employee invited. They will receive an email to set their password.");
      }
      utils.admin.listEmployees.invalidate();
      setShowAdd(false);
      setForm(emptyForm);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMutation = trpc.admin.updateEmployee.useMutation({
    onSuccess: () => {
      toast.success("Employee updated.");
      utils.admin.listEmployees.invalidate();
      setEditEmployee(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deactivateMutation = trpc.admin.deactivateEmployee.useMutation({
    onSuccess: () => {
      toast.success("Employee deactivated.");
      utils.admin.listEmployees.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const unverifiedCount = employees?.filter(e => !e.isVerified).length ?? 0;

  const filtered = (employees ?? []).filter(e => {
    const matchSearch = `${e.firstName} ${e.lastName} ${e.email} ${e.employeeNumber}`
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchFilter = filterUnverified ? !e.isVerified : true;
    return matchSearch && matchFilter;
  });

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Employees
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage ICU staff accounts</p>
        </div>
        <Button
          onClick={() => { setShowAdd(true); setForm(emptyForm); }}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="w-4 h-4 mr-2" /> Add Employee
        </Button>
      </div>

      {/* Unverified alert banner */}
      {unverifiedCount > 0 && (
        <div
          className="flex items-center gap-3 mb-4 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 cursor-pointer hover:bg-yellow-500/15 transition-colors"
          onClick={() => setFilterUnverified(v => !v)}
        >
          <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-yellow-300">
              {unverifiedCount} unverified account{unverifiedCount !== 1 ? "s" : ""} need{unverifiedCount === 1 ? "s" : ""} official employee number &amp; seniority date.
            </span>
          </div>
          <span className="text-xs text-yellow-400 shrink-0">
            {filterUnverified ? "Show all" : "Show only unverified"}
          </span>
        </div>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, or employee number..."
          className="pl-10 bg-input border-border/60"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : (
        <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-secondary/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Employee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shift</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Seniority</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="animate-stagger">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">
                      No employees found.
                    </td>
                  </tr>
                ) : filtered.map(emp => (
                  <tr key={emp.id} className={`border-b border-border/20 hover:bg-secondary/20 transition-colors ${!emp.isVerified ? "bg-yellow-500/5" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-medium text-foreground flex items-center gap-1.5">
                            {emp.firstName} {emp.lastName}
                            {!emp.isVerified && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                                <AlertCircle className="w-2.5 h-2.5" />
                                UNVERIFIED
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {emp.email}
                            {emp.employeeNumber.startsWith("TEMP-")
                              ? <span className="ml-1 text-yellow-500/70">· Pending Emp #</span>
                              : <span className="ml-1">· #{emp.employeeNumber}</span>
                            }
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                        emp.shift === "AM"
                          ? "bg-[oklch(0.68_0.15_200/15%)] text-[oklch(0.68_0.15_200)] border-[oklch(0.68_0.15_200/30%)]"
                          : emp.shift === "PM"
                          ? "bg-[oklch(0.70_0.15_290/15%)] text-[oklch(0.70_0.15_290)] border-[oklch(0.70_0.15_290/30%)]"
                          : "bg-[oklch(0.65_0.17_160/15%)] text-[oklch(0.65_0.17_160)] border-[oklch(0.65_0.17_160/30%)]"
                      }`}>{emp.shift}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{emp.role}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {emp.isVerified
                        ? format(new Date(emp.seniorityDate), "MMM yyyy")
                        : <span className="text-yellow-500/70 italic">Pending</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        emp.isActive ? "badge-approved" : "badge-withdrawn"
                      }`}>
                        {emp.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {/* Verify button — only shown for unverified employees */}
                        {!emp.isVerified && (
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10"
                            title="Set official employee number & seniority date"
                            onClick={() => setVerifyEmployee(emp as any)}
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          onClick={() => {
                            setEditEmployee(emp as any);
                            setForm({
                              ...emptyForm,
                              firstName: emp.firstName,
                              lastName: emp.lastName,
                              email: emp.email,
                              shift: emp.shift as any,
                              role: emp.role as any,
                              employeeNumber: emp.employeeNumber,
                              seniorityDate: emp.seniorityDate ? emp.seniorityDate.split("T")[0] : "",
                            });
                          }}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        {emp.isActive && (
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => deactivateMutation.mutate({ id: emp.id })}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Employee dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-card border-border/60">
          <DialogHeader><DialogTitle>Add Employee</DialogTitle></DialogHeader>
          <EmployeeForm
            form={form}
            setForm={setForm}
            onSave={(data) => createMutation.mutate({ ...data, origin: window.location.origin })}
            isPending={createMutation.isPending}
            showPassword={true}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Employee dialog */}
      <Dialog open={!!editEmployee} onOpenChange={() => setEditEmployee(null)}>
        <DialogContent className="bg-card border-border/60">
          <DialogHeader><DialogTitle>Edit Employee</DialogTitle></DialogHeader>
          <EmployeeForm
            form={form}
            setForm={setForm}
            onSave={(data) => editEmployee && updateMutation.mutate({ id: editEmployee.id, ...data })}
            isPending={updateMutation.isPending}
            showPassword={false}
          />
        </DialogContent>
      </Dialog>

      {/* Verify Employee dialog */}
      <Dialog open={!!verifyEmployee} onOpenChange={() => setVerifyEmployee(null)}>
        {verifyEmployee && (
          <VerifyEmployeeDialog
            employee={verifyEmployee}
            onClose={() => setVerifyEmployee(null)}
          />
        )}
      </Dialog>
    </div>
  );
}
