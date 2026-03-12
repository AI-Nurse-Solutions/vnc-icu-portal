import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, HeartPulse, Lock, CheckCircle2 } from "lucide-react";

export default function AcceptInvite() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);

  const [tokenInfo, setTokenInfo] = useState<{ firstName: string } | null | undefined>(undefined);
  const [tokenLoading, setTokenLoading] = useState(true);

  useEffect(() => {
    if (token) {
      // We'll just show the form and let acceptInvite handle validation
      setTokenInfo({ firstName: "" });
      setTokenLoading(false);
    } else {
      setTokenLoading(false);
    }
  }, [token]);

  const acceptMutation = trpc.auth.acceptInvite.useMutation({
    onSuccess: () => {
      setDone(true);
      toast.success("Account activated! You can now sign in.");
      setTimeout(() => navigate("/login"), 2000);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { toast.error("Password must be at least 8 characters."); return; }
    if (password !== confirm) { toast.error("Passwords do not match."); return; }
    acceptMutation.mutate({ token, password });
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-destructive font-semibold">Invalid invite link.</p>
          <a href="/login" className="text-primary text-sm hover:underline mt-2 block">Go to login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md px-4 animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 mb-4">
            <HeartPulse className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Activate Your Account</h1>
          <p className="text-muted-foreground text-sm mt-1">VNC ICU Vacation Request Portal</p>
        </div>

        <div className="bg-card border border-border/60 rounded-2xl shadow-2xl p-8">
          {tokenLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
          ) : !tokenInfo ? (
            <div className="text-center py-4">
              <p className="text-destructive font-semibold">This invite link is invalid or has expired.</p>
              <a href="/login" className="text-primary text-sm hover:underline mt-2 block">Go to login</a>
            </div>
          ) : done ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-10 h-10 text-[oklch(0.65_0.17_160)] mx-auto mb-3" />
              <p className="font-semibold text-foreground">Account activated!</p>
              <p className="text-sm text-muted-foreground mt-1">Redirecting to login...</p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-foreground">Welcome, {tokenInfo.firstName}!</h2>
                <p className="text-sm text-muted-foreground mt-1">Set a password to activate your account.</p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input type="password" value={password} onChange={e => setPassword(e.target.value)} className="pl-10 bg-input border-border/60" placeholder="Min 8 characters" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className="pl-10 bg-input border-border/60" placeholder="Repeat password" required />
                  </div>
                </div>
                <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-11" disabled={acceptMutation.isPending}>
                  {acceptMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Activate Account
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
