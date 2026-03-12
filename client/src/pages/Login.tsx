import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Mail, Lock, ArrowRight, HeartPulse } from "lucide-react";

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = trpc.auth.initiateLogin.useMutation({
    onSuccess: () => {
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
        <div className="bg-card border border-border/60 rounded-2xl shadow-2xl p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground">Sign In</h2>
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
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          VNC ICU Vacation Request Portal · Secure Access
        </p>
      </div>
    </div>
  );
}
