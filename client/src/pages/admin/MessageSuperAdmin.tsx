import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { MessageSquare, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function MessageSuperAdmin() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);

  const sendMsg = trpc.adminLanding.sendMessageToSuperadmin.useMutation({
    onSuccess: () => {
      setSent(true);
      toast.success("Message sent to Super Admin.");
    },
    onError: (err) => {
      toast.error("Failed to send: " + err.message);
    },
  });

  const handleSend = () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and message body are required.");
      return;
    }
    sendMsg.mutate({ subject: subject.trim(), message: body.trim() });
  };

  const handleReset = () => {
    setSubject("");
    setBody("");
    setSent(false);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <MessageSquare className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Message Super Admin</h1>
          <p className="text-sm text-muted-foreground">Send a direct message or escalation to the Super Administrator</p>
        </div>
      </div>

      {sent ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="w-12 h-12 text-primary" />
            <div>
              <p className="text-lg font-semibold text-foreground">Message Sent</p>
              <p className="text-sm text-muted-foreground mt-1">Your message has been delivered to the Super Admin.</p>
            </div>
            <Button variant="outline" onClick={handleReset} className="mt-2">
              Send Another Message
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Compose Message</CardTitle>
            <CardDescription>
              Use this channel for escalations, policy questions, or operational updates that require Super Admin attention.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                placeholder="e.g. Escalation: July 4 over-cap situation"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={120}
              />
              <p className="text-xs text-muted-foreground text-right">{subject.length}/120</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="body">Message</Label>
              <Textarea
                id="body"
                placeholder="Describe the situation, what decision or action is needed, and any relevant context..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                maxLength={2000}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground text-right">{body.length}/2000</p>
            </div>
            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSend}
                disabled={sendMsg.isPending || !subject.trim() || !body.trim()}
                className="gap-2"
              >
                <Send className="w-4 h-4" />
                {sendMsg.isPending ? "Sending…" : "Send Message"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Usage guidance */}
      <Card className="bg-secondary/30 border-border/40">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">When to use this channel:</strong> Policy exceptions, over-cap escalations,
            employee grievances requiring Super Admin review, or any situation where Admin authority is insufficient.
            Messages are delivered as system notifications and do not replace email communication.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
