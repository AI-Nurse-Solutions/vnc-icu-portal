import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Loader2, Mail, Lock, ArrowRight, HeartPulse,
  User, Hash, ChevronDown
} from "lucide-react";

type Tab = "signin" | "signup";

const SHIFTS = [
  { value: "AM", label: "AM — Day Shift" },
  { value: "PM", label: "PM — Evening Shift" },
  { value: "NOC", label: "NOC — Night Shift" },
] as const;

export default function Login() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("signin");
  const utils = trpc.useUtils();

  // ── Sign In state ──────────────────────────────────────────────────────────
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = trpc.auth.initiateLogin.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("Login successful. Welcome back.");
      navigate("/dashboard");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    loginMutation.mutate({ email, password });
  };

  // ── Sign Up state ──────────────────────────────────────────────────────────
  const [signupFirstName, setSignupFirstName] = useState("");
  const [signupLastName, setSignupLastName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupEmployeeNumber, setSignupEmployeeNumber] = useState("");
  const [signupShift, setSignupShift] = useState<"AM" | "PM" | "NOC">("AM");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");

  const signupMutation = trpc.auth.signup.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("Account created. Welcome to VNC ICU Portal.");
      navigate("/dashboard");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    if (signupPassword !== signupConfirm) {
      toast.error("Passwords do not match.");
      return;
    }
    if (signupPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    signupMutation.mutate({
      firstName: signupFirstName.trim(),
      lastName: signupLastName.trim(),
      email: signupEmail.trim(),
      employeeNumber: signupEmployeeNumber.trim(),
      shift: signupShift,
      password: signupPassword,
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.22_0.04_200/20%)_0%,transparent_60%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom_right,oklch(0.68_0.15_200/5%)_0%,transparent_50%)] pointer-events-none" />

      <div className="w-full max-w-md px-4 animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 mb-4 shadow-[0_0_30px_oklch(0.68_0.15_200/20%)]">
            <HeartPulse className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">VNC ICU Portal</h1>
          <p className="text-muted-foreground text-sm mt-1">Van Ness Campus · Critical Care Unit</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border/60 rounded-2xl shadow-2xl overflow-hidden">
          {/* Tab switcher */}
          <div className="flex border-b border-border/60">
            <button
              onClick={() => setTab("signin")}
              className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${
                tab === "signin"
                  ? "text-primary border-b-2 border-primary bg-primary/5"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setTab("signup")}
              className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${
                tab === "signup"
                  ? "text-primary border-b-2 border-primary bg-primary/5"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Create Account
            </button>
          </div>

          <div className="p-8">
            {/* ── Sign In ── */}
            {tab === "signin" && (
              <>
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-foreground">Welcome back</h2>
                  <p className="text-sm text-muted-foreground mt-1">Enter your credentials to continue</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="pl-10 bg-input border-border/60 focus:border-primary"
                        required
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="pl-10 bg-input border-border/60 focus:border-primary"
                        required
                        autoComplete="current-password"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold h-11"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in...</>
                    ) : (
                      <><ArrowRight className="w-4 h-4 mr-2" /> Sign In</>
                    )}
                  </Button>

                  <div className="text-center">
                    <a href="/forgot-password" className="text-xs text-primary hover:underline">
                      Forgot password?
                    </a>
                  </div>
                </form>
              </>
            )}

            {/* ── Create Account ── */}
            {tab === "signup" && (
              <>
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-foreground">Create your account</h2>
                  <p className="text-sm text-muted-foreground mt-1">For VNC ICU staff only. Your account will be active immediately.</p>
                </div>

                <form onSubmit={handleSignup} className="space-y-4">
                  {/* Name row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="su-first" className="text-sm font-medium">First Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="su-first"
                          type="text"
                          value={signupFirstName}
                          onChange={e => setSignupFirstName(e.target.value)}
                          placeholder="Jane"
                          className="pl-10 bg-input border-border/60 focus:border-primary"
                          required
                          autoComplete="given-name"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-last" className="text-sm font-medium">Last Name</Label>
                      <Input
                        id="su-last"
                        type="text"
                        value={signupLastName}
                        onChange={e => setSignupLastName(e.target.value)}
                        placeholder="Doe"
                        className="bg-input border-border/60 focus:border-primary"
                        required
                        autoComplete="family-name"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-2">
                    <Label htmlFor="su-email" className="text-sm font-medium">Work Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="su-email"
                        type="email"
                        value={signupEmail}
                        onChange={e => setSignupEmail(e.target.value)}
                        placeholder="jane.doe@sutterhealth.org"
                        className="pl-10 bg-input border-border/60 focus:border-primary"
                        required
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  {/* Employee number + shift row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="su-empnum" className="text-sm font-medium">Employee #</Label>
                      <div className="relative">
                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="su-empnum"
                          type="text"
                          value={signupEmployeeNumber}
                          onChange={e => setSignupEmployeeNumber(e.target.value)}
                          placeholder="EMP-001"
                          className="pl-10 bg-input border-border/60 focus:border-primary"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-shift" className="text-sm font-medium">Shift</Label>
                      <div className="relative">
                        <select
                          id="su-shift"
                          value={signupShift}
                          onChange={e => setSignupShift(e.target.value as "AM" | "PM" | "NOC")}
                          className="w-full h-10 rounded-md border border-border/60 bg-input px-3 pr-8 text-sm text-foreground appearance-none focus:outline-none focus:border-primary"
                          required
                        >
                          {SHIFTS.map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-2">
                    <Label htmlFor="su-pass" className="text-sm font-medium">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="su-pass"
                        type="password"
                        value={signupPassword}
                        onChange={e => setSignupPassword(e.target.value)}
                        placeholder="Min. 8 characters"
                        className="pl-10 bg-input border-border/60 focus:border-primary"
                        required
                        minLength={8}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  {/* Confirm password */}
                  <div className="space-y-2">
                    <Label htmlFor="su-confirm" className="text-sm font-medium">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="su-confirm"
                        type="password"
                        value={signupConfirm}
                        onChange={e => setSignupConfirm(e.target.value)}
                        placeholder="Re-enter password"
                        className="pl-10 bg-input border-border/60 focus:border-primary"
                        required
                        minLength={8}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold h-11"
                    disabled={signupMutation.isPending}
                  >
                    {signupMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating account...</>
                    ) : (
                      <><ArrowRight className="w-4 h-4 mr-2" /> Create Account</>
                    )}
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    Your seniority date will be set by your manager after account creation.
                  </p>
                </form>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          VNC ICU Vacation Request Portal · Secure Access
        </p>
      </div>
    </div>
  );
}
