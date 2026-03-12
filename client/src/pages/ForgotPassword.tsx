import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, HeartPulse, Mail, CheckCircle2 } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const mutation = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => setSent(true),
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md px-4 animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 mb-4">
            <HeartPulse className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Reset Password</h1>
          <p className="text-muted-foreground text-sm mt-1">VNC ICU Vacation Request Portal</p>
        </div>
        <div className="bg-card border border-border/60 rounded-2xl shadow-2xl p-8">
          {sent ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-10 h-10 text-[oklch(0.65_0.17_160)] mx-auto mb-3" />
              <p className="font-semibold text-foreground">Check your email</p>
              <p className="text-sm text-muted-foreground mt-1">If an account exists for {email}, you'll receive a reset link shortly.</p>
              <a href="/login" className="text-primary text-sm hover:underline mt-4 block">Back to login</a>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-foreground">Forgot your password?</h2>
                <p className="text-sm text-muted-foreground mt-1">Enter your email and we'll send a reset link.</p>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); mutation.mutate({ email, origin: window.location.origin }); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="pl-10 bg-input border-border/60" placeholder="you@vnc-icu.local" required />
                  </div>
                </div>
                <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-11" disabled={mutation.isPending}>
                  {mutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Send Reset Link
                </Button>
                <div className="text-center">
                  <a href="/login" className="text-xs text-muted-foreground hover:text-foreground">← Back to login</a>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
