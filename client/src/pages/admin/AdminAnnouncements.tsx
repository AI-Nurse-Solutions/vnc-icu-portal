import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Bell, Lightbulb, Plus, Pencil, Trash2, Eye, EyeOff, X, Check } from "lucide-react";

type AnnouncementType = "announcement" | "tip";

interface AnnouncementRow {
  id: number;
  type: AnnouncementType;
  title: string;
  body: string;
  isActive: boolean;
  createdAt: Date | string;
}

interface FormState {
  type: AnnouncementType;
  title: string;
  body: string;
  isActive: boolean;
}

const emptyForm = (): FormState => ({ type: "announcement", title: "", body: "", isActive: true });

export default function AdminAnnouncements() {
  const utils = trpc.useUtils();
  const { data: rows = [], isLoading } = trpc.admin.listAnnouncements.useQuery();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const createMutation = trpc.admin.createAnnouncement.useMutation({
    onSuccess: () => {
      utils.admin.listAnnouncements.invalidate();
      utils.portal.getPortalData.invalidate();
      toast.success("Announcement created");
      setShowForm(false);
      setForm(emptyForm());
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.admin.updateAnnouncement.useMutation({
    onSuccess: () => {
      utils.admin.listAnnouncements.invalidate();
      utils.portal.getPortalData.invalidate();
      toast.success("Announcement updated");
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.admin.deleteAnnouncement.useMutation({
    onSuccess: () => {
      utils.admin.listAnnouncements.invalidate();
      utils.portal.getPortalData.invalidate();
      toast.success("Announcement deleted");
      setDeleteConfirm(null);
    },
    onError: (e) => toast.error(e.message),
  });

  function startEdit(row: AnnouncementRow) {
    setEditingId(row.id);
    setForm({ type: row.type, title: row.title, body: row.body, isActive: row.isActive });
    setShowForm(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
  }

  function handleSubmit() {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error("Title and body are required.");
      return;
    }
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, ...form });
    } else {
      createMutation.mutate(form);
    }
  }

  const isBusy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Announcements &amp; Tips</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage what employees see on their My Portal landing page.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm()); }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> New
        </button>
      </div>

      {/* Create / Edit form */}
      {(showForm || editingId !== null) && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">
              {editingId !== null ? "Edit Announcement" : "New Announcement"}
            </h2>
            <button onClick={() => { setShowForm(false); cancelEdit(); }} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Type toggle */}
          <div className="flex gap-2">
            {(["announcement", "tip"] as AnnouncementType[]).map((t) => (
              <button
                key={t}
                onClick={() => setForm(f => ({ ...f, type: t }))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  form.type === t
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                {t === "announcement" ? <Bell className="w-3.5 h-3.5" /> : <Lightbulb className="w-3.5 h-3.5" />}
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Title</label>
            <input
              type="text"
              maxLength={128}
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Deliberation In Progress"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Body</label>
            <textarea
              rows={3}
              value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Full message text…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
              className={`w-10 h-5 rounded-full transition-colors ${form.isActive ? "bg-primary" : "bg-muted"} relative`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.isActive ? "translate-x-5" : ""}`} />
            </div>
            <span className="text-sm text-foreground">{form.isActive ? "Active (visible to employees)" : "Inactive (hidden)"}</span>
          </label>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowForm(false); cancelEdit(); }}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isBusy}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {editingId !== null ? "Save Changes" : "Create"}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (rows as AnnouncementRow[]).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No announcements yet. Create one above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(rows as AnnouncementRow[]).map((row) => (
            <div
              key={row.id}
              className={`rounded-xl border p-4 flex gap-3 transition-opacity ${row.isActive ? "border-border bg-card" : "border-border/50 bg-muted/30 opacity-60"}`}
            >
              {/* Icon */}
              <div className="shrink-0 mt-0.5">
                {row.type === "announcement"
                  ? <Bell className="w-4 h-4 text-muted-foreground" />
                  : <Lightbulb className="w-4 h-4 text-muted-foreground" />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide mr-2 ${
                      row.type === "announcement" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {row.type}
                    </span>
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                      row.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {row.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {/* Row actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Toggle active */}
                    <button
                      onClick={() => updateMutation.mutate({ id: row.id, isActive: !row.isActive })}
                      disabled={isBusy}
                      title={row.isActive ? "Deactivate" : "Activate"}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {row.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    {/* Edit */}
                    <button
                      onClick={() => startEdit(row)}
                      disabled={isBusy}
                      title="Edit"
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    {/* Delete */}
                    {deleteConfirm === row.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => deleteMutation.mutate({ id: row.id })}
                          disabled={isBusy}
                          className="px-2 py-1 rounded bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-2 py-1 rounded border border-border text-xs text-muted-foreground hover:bg-muted"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(row.id)}
                        disabled={isBusy}
                        title="Delete"
                        className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm font-semibold text-foreground mt-1">{row.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{row.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
