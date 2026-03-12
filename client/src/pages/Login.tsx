import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Mail, Lock, ArrowRight, HeartPulse } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

type Step = "credentials" | "otp";

export default function Login() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");

  const initiateMutation = trpc.auth.initiateLogin.useMutation({
    onSuccess: () => {
      setStep("otp");
      toast.success("OTP sent to your email. Check your inbox.");
    },
    onError: (e) => toast.error(e.message),
  });

  const verifyMutation = trpc.auth.verifyOtp.useMutation({
    onSuccess: () => {
      toast.success("Login successful. Welcome back.");
      navigate("/dashboard");
    },
    onError: (e) => {
      toast.error(e.message);
      setOtp("");
    },
  });

  const handleCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    initiateMutation.mutate({ email, password });
  };

  const handleOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) return;
    verifyMutation.mutate({ email, otp });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background grid */}
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
        <div className="bg-card border border-border/60 rounded-2xl shadow-2xl p-8">
          {step === "credentials" ? (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-foreground">Sign In</h2>
                <p className="text-sm text-muted-foreground mt-1">Enter your credentials to continue</p>
              </div>
              <form onSubmit={handleCredentials} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@vnc-icu.local"
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
                  disabled={initiateMutation.isPending}
                >
                  {initiateMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</>
                  ) : (
                    <><ArrowRight className="w-4 h-4 mr-2" /> Continue</>
                  )}
                </Button>
                <div className="text-center">
                  <a href="/forgot-password" className="text-xs text-primary hover:underline">
                    Forgot password?
                  </a>
                </div>
              </form>
            </>
          ) : (
            <>
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold text-foreground">Two-Factor Verification</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  A 6-digit code was sent to <span className="text-foreground font-medium">{email}</span>. Code expires in 10 minutes.
                </p>
              </div>
              <form onSubmit={handleOtp} className="space-y-6">
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={setOtp}
                    className="gap-2"
                  >
                    <InputOTPGroup className="gap-2">
                      {[0,1,2,3,4,5].map(i => (
                        <InputOTPSlot
                          key={i}
                          index={i}
                          className="w-12 h-14 text-xl font-bold border-border/60 bg-input focus:border-primary rounded-lg"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button
                  type="submit"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold h-11"
                  disabled={verifyMutation.isPending || otp.length !== 6}
                >
                  {verifyMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</>
                  ) : (
                    <><ShieldCheck className="w-4 h-4 mr-2" /> Verify & Sign In</>
                  )}
                </Button>
                <div className="text-center space-y-2">
                  <button
                    type="button"
                    onClick={() => { setStep("credentials"); setOtp(""); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ← Back to login
                  </button>
                  <br />
                  <button
                    type="button"
                    onClick={() => initiateMutation.mutate({ email, password })}
                    disabled={initiateMutation.isPending}
                    className="text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    Resend code
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          VNC ICU Vacation Request Portal · Secure Access
        </p>
      </div>
    </div>
  );
}
