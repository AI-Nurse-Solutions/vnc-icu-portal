import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Inbox, Mail, MailOpen, AlertTriangle, Trash2, Reply,
  ChevronDown, ChevronUp, RefreshCw, Clock
} from "lucide-react";

type Message = {
  id: number;
  fromEmployeeId: number;
  fromFirstName: string;
  fromLastName: string;
  fromShift: string;
  fromRole: string;
  subject: string;
  body: string;
  isRead: boolean;
  isUrgent: boolean;
  readAt: string | null;
  replyBody: string | null;
  repliedAt: string | null;
  createdAt: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function roleBadge(role: string) {
  const map: Record<string, string> = {
    admin: "bg-teal-500/20 text-teal-300 border-teal-500/30",
    manager: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    super_admin: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  };
  return map[role] ?? "bg-muted text-muted-foreground border-border";
}

export default function SuperAdminInbox() {
  const utils = trpc.useUtils();
  const { data: messages = [], isLoading, refetch } = trpc.inbox.getMessages.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const markRead = trpc.inbox.markRead.useMutation({
    onSuccess: () => utils.inbox.getMessages.invalidate(),
  });
  const replyMut = trpc.inbox.reply.useMutation({
    onSuccess: () => {
      toast.success("Reply sent");
      setReplyingId(null);
      setReplyText("");
      utils.inbox.getMessages.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.inbox.deleteMessage.useMutation({
    onSuccess: () => {
      toast.success("Message deleted");
      setExpandedId(null);
      utils.inbox.getMessages.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "urgent">("all");

  const filtered = messages.filter((m: Message) => {
    if (filter === "unread") return !m.isRead;
    if (filter === "urgent") return m.isUrgent;
    return true;
  });

  const unreadCount = messages.filter((m: Message) => !m.isRead).length;
  const urgentCount = messages.filter((m: Message) => m.isUrgent && !m.isRead).length;

  function handleExpand(msg: Message) {
    if (expandedId === msg.id) {
      setExpandedId(null);
      setReplyingId(null);
      setReplyText("");
      return;
    }
    setExpandedId(msg.id);
    setReplyingId(null);
    setReplyText("");
    if (!msg.isRead) {
      markRead.mutate({ id: msg.id });
    }
  }

  function handleReply(id: number) {
    if (replyingId === id) {
      setReplyingId(null);
      setReplyText("");
      return;
    }
    setReplyingId(id);
    setReplyText("");
  }

  function submitReply(id: number) {
    if (!replyText.trim()) return;
    replyMut.mutate({ id, replyBody: replyText.trim() });
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
            <Inbox className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Admin Inbox</h1>
            <p className="text-sm text-muted-foreground">
              Messages from admins and managers
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Badge className="bg-primary/20 text-primary border-primary/30">
              {unreadCount} unread
            </Badge>
          )}
          {urgentCount > 0 && (
            <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
              {urgentCount} urgent
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 bg-muted/30 rounded-lg border border-border/40 w-fit">
        {(["all", "unread", "urgent"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              filter === f
                ? "bg-background text-foreground shadow-sm border border-border/40"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Message list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-muted/20 animate-pulse border border-border/30" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MailOpen className="w-12 h-12 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground font-medium">
            {filter === "all" ? "No messages yet" : `No ${filter} messages`}
          </p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Messages from admins will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((msg: Message) => {
            const isExpanded = expandedId === msg.id;
            return (
              <div
                key={msg.id}
                className={`rounded-xl border transition-all ${
                  !msg.isRead
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/40 bg-card/50"
                } ${msg.isUrgent ? "ring-1 ring-red-500/30" : ""}`}
              >
                {/* Row header */}
                <button
                  className="w-full text-left px-5 py-4 flex items-start gap-4"
                  onClick={() => handleExpand(msg)}
                >
                  {/* Read indicator */}
                  <div className="mt-1 shrink-0">
                    {msg.isRead
                      ? <MailOpen className="w-4 h-4 text-muted-foreground/50" />
                      : <Mail className="w-4 h-4 text-primary" />
                    }
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-semibold text-sm ${!msg.isRead ? "text-foreground" : "text-muted-foreground"}`}>
                        {msg.fromLastName}, {msg.fromFirstName}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${roleBadge(msg.fromRole)}`}>
                        {msg.fromRole.replace("_", " ")}
                      </span>
                      <span className="text-xs text-muted-foreground/60">{msg.fromShift} shift</span>
                      {msg.isUrgent && (
                        <span className="flex items-center gap-1 text-xs text-red-400 font-semibold">
                          <AlertTriangle className="w-3 h-3" /> URGENT
                        </span>
                      )}
                      {msg.replyBody && (
                        <span className="text-xs text-teal-400/80">Replied</span>
                      )}
                    </div>
                    <p className={`text-sm mt-0.5 truncate ${!msg.isRead ? "text-foreground" : "text-muted-foreground"}`}>
                      {msg.subject}
                    </p>
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground/50">
                      <Clock className="w-3 h-3" />
                      {formatDate(msg.createdAt)}
                    </div>
                  </div>

                  {/* Expand chevron */}
                  <div className="shrink-0 mt-1 text-muted-foreground/50">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {/* Expanded body */}
                {isExpanded && (
                  <div className="px-5 pb-5 space-y-4 border-t border-border/30 pt-4">
                    {/* Subject */}
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Subject</p>
                      <p className="text-sm font-medium text-foreground">{msg.subject}</p>
                    </div>

                    {/* Body */}
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Message</p>
                      <div className="bg-muted/20 rounded-lg p-4 text-sm text-foreground/90 whitespace-pre-wrap border border-border/30">
                        {msg.body}
                      </div>
                    </div>

                    {/* Existing reply */}
                    {msg.replyBody && (
                      <div>
                        <p className="text-xs text-teal-400 uppercase tracking-wide mb-1">Your Reply · {msg.repliedAt ? formatDate(msg.repliedAt) : ""}</p>
                        <div className="bg-teal-500/5 rounded-lg p-4 text-sm text-foreground/80 whitespace-pre-wrap border border-teal-500/20">
                          {msg.replyBody}
                        </div>
                      </div>
                    )}

                    {/* Reply compose */}
                    {replyingId === msg.id && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          {msg.replyBody ? "Update Reply" : "Write Reply"}
                        </p>
                        <Textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Type your reply..."
                          rows={4}
                          maxLength={2000}
                          className="bg-muted/20 border-border/40 text-sm resize-none"
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground/50">{replyText.length}/2000</span>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setReplyingId(null); setReplyText(""); }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => submitReply(msg.id)}
                              disabled={!replyText.trim() || replyMut.isPending}
                              className="bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                              {replyMut.isPending ? "Sending..." : "Send Reply"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReply(msg.id)}
                        className="gap-1.5 text-xs"
                      >
                        <Reply className="w-3.5 h-3.5" />
                        {replyingId === msg.id ? "Cancel Reply" : msg.replyBody ? "Edit Reply" : "Reply"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMut.mutate({ id: msg.id })}
                        disabled={deleteMut.isPending}
                        className="gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
