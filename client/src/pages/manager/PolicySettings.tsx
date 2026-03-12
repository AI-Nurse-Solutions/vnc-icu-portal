import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Settings, Loader2, Plus, Trash2, AlertTriangle, Calendar } from "lucide-react";
import { format } from "date-fns";

export default function PolicySettings() {
  const utils = trpc.useUtils();

  const { data: configs } = trpc.config.getAll.useQuery();
  const { data: blackouts } = trpc.config.getBlackouts.useQuery();
  const { data: deadlines } = trpc.config.getDeadlines.useQuery();

  const configMap = Object.fromEntries(configs?.map(c => [c.key, c.value]) ?? []);

  const [capAM, setCapAM] = useState("");
  const [capPM, setCapPM] = useState("");
  const [capNOC, setCapNOC] = useState("");
  const [yellowThreshold, setYellowThreshold] = useState("");
  const [redThreshold, setRedThreshold] = useState("");

  const [newBlackout, setNewBlackout] = useState({ date: "", reason: "" });
  const [newDeadline, setNewDeadline] = useState({ deadlineDate: "", coverageStart: "", coverageEnd: "", year: new Date().getFullYear() });

  useEffect(() => {
    if (configMap.cap_am) setCapAM(configMap.cap_am);
    if (configMap.cap_pm) setCapPM(configMap.cap_pm);
    if (configMap.cap_noc) setCapNOC(configMap.cap_noc);
    if (configMap.color_yellow_threshold) setYellowThreshold(configMap.color_yellow_threshold);
    if (configMap.color_red_threshold) setRedThreshold(configMap.color_red_threshold);
  }, [configs]);

  const setCapacityMutation = trpc.config.setCapacity.useMutation({
    onSuccess: () => { toast.success("Capacity settings saved."); utils.config.getAll.invalidate(); utils.calendar.getMonthData.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const addBlackoutMutation = trpc.config.addBlackout.useMutation({
    onSuccess: () => { toast.success("Blackout date added."); utils.config.getBlackouts.invalidate(); setNewBlackout({ date: "", reason: "" }); },
    onError: (e) => toast.error(e.message),
  });

  const removeBlackoutMutation = trpc.config.removeBlackout.useMutation({
    onSuccess: () => { toast.success("Blackout date removed."); utils.config.getBlackouts.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const addDeadlineMutation = trpc.config.addDeadline.useMutation({
    onSuccess: () => { toast.success("Deadline added."); utils.config.getDeadlines.invalidate(); setNewDeadline({ deadlineDate: "", coverageStart: "", coverageEnd: "", year: new Date().getFullYear() }); },
    onError: (e) => toast.error(e.message),
  });

  const removeDeadlineMutation = trpc.config.removeDeadline.useMutation({
    onSuccess: () => { toast.success("Deadline removed."); utils.config.getDeadlines.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          Policy Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configure shift capacity, blackout dates, and submission deadlines</p>
      </div>

      <div className="space-y-6">
        {/* Capacity */}
        <div className="bg-card border border-border/40 rounded-xl p-5">
          <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary" />
            Shift Approval Caps
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {[
              { label: "AM Shift Cap", value: capAM, setter: setCapAM, color: "text-[oklch(0.68_0.15_200)]" },
              { label: "PM Shift Cap", value: capPM, setter: setCapPM, color: "text-[oklch(0.70_0.15_290)]" },
              { label: "NOC Shift Cap", value: capNOC, setter: setCapNOC, color: "text-[oklch(0.65_0.17_160)]" },
            ].map(({ label, value, setter, color }) => (
              <div key={label}>
                <Label className={`text-xs font-semibold mb-1.5 block ${color}`}>{label}</Label>
                <Input
                  type="number"
                  min={1} max={50}
                  value={value}
                  onChange={e => setter(e.target.value)}
                  className="bg-input border-border/60"
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <Label className="text-xs font-semibold mb-1.5 block text-[oklch(0.75_0.18_70)]">Yellow Threshold (Filling)</Label>
              <Input type="number" min={1} max={50} value={yellowThreshold} onChange={e => setYellowThreshold(e.target.value)} className="bg-input border-border/60" />
            </div>
            <div>
              <Label className="text-xs font-semibold mb-1.5 block text-destructive">Red Threshold (Full)</Label>
              <Input type="number" min={1} max={50} value={redThreshold} onChange={e => setRedThreshold(e.target.value)} className="bg-input border-border/60" />
            </div>
          </div>
          <Button
            onClick={() => setCapacityMutation.mutate({
              capAM: parseInt(capAM), capPM: parseInt(capPM), capNOC: parseInt(capNOC),
              yellowThreshold: parseInt(yellowThreshold), redThreshold: parseInt(redThreshold),
            })}
            disabled={setCapacityMutation.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {setCapacityMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Capacity Settings
          </Button>
        </div>

        {/* Blackout dates */}
        <div className="bg-card border border-border/40 rounded-xl p-5">
          <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            Unit-Wide Blackout Dates
          </h2>
          <div className="space-y-2 mb-4">
            {blackouts?.length === 0 && <p className="text-xs text-muted-foreground">No blackout dates configured.</p>}
            {blackouts?.map(b => (
              <div key={b.id} className="flex items-center justify-between bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
                <div>
                  <span className="text-sm font-medium text-foreground">{format(new Date(b.date + "T12:00:00"), "EEEE, MMMM d, yyyy")}</span>
                  {b.reason && <p className="text-xs text-muted-foreground">{b.reason}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeBlackoutMutation.mutate({ id: b.id })}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Input
              type="date"
              value={newBlackout.date}
              onChange={e => setNewBlackout(p => ({ ...p, date: e.target.value }))}
              className="bg-input border-border/60 w-auto"
            />
            <Input
              placeholder="Reason (optional)"
              value={newBlackout.reason}
              onChange={e => setNewBlackout(p => ({ ...p, reason: e.target.value }))}
              className="bg-input border-border/60 flex-1 min-w-[160px]"
            />
            <Button
              onClick={() => addBlackoutMutation.mutate({ date: newBlackout.date, reason: newBlackout.reason || undefined })}
              disabled={!newBlackout.date || addBlackoutMutation.isPending}
              className="bg-destructive/20 text-destructive border border-destructive/40 hover:bg-destructive/30"
            >
              <Plus className="w-4 h-4 mr-1" /> Add Blackout
            </Button>
          </div>
        </div>

        {/* Submission deadlines */}
        <div className="bg-card border border-border/40 rounded-xl p-5">
          <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Submission Deadlines
          </h2>
          <div className="space-y-2 mb-4">
            {deadlines?.length === 0 && <p className="text-xs text-muted-foreground">No deadlines configured.</p>}
            {deadlines?.map(d => (
              <div key={d.id} className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                <div>
                  <span className="text-sm font-medium text-foreground">
                    Deadline: {format(new Date(d.deadlineDate + "T12:00:00"), "MMM d, yyyy")}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    Covers: {format(new Date(d.coverageStart + "T12:00:00"), "MMM d")} – {format(new Date(d.coverageEnd + "T12:00:00"), "MMM d, yyyy")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeDeadlineMutation.mutate({ id: d.id })}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Deadline Date</Label>
              <Input type="date" value={newDeadline.deadlineDate} onChange={e => setNewDeadline(p => ({ ...p, deadlineDate: e.target.value }))} className="bg-input border-border/60" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Coverage Start</Label>
              <Input type="date" value={newDeadline.coverageStart} onChange={e => setNewDeadline(p => ({ ...p, coverageStart: e.target.value }))} className="bg-input border-border/60" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Coverage End</Label>
              <Input type="date" value={newDeadline.coverageEnd} onChange={e => setNewDeadline(p => ({ ...p, coverageEnd: e.target.value }))} className="bg-input border-border/60" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Year</Label>
              <Input type="number" value={newDeadline.year} onChange={e => setNewDeadline(p => ({ ...p, year: parseInt(e.target.value) }))} className="bg-input border-border/60" />
            </div>
          </div>
          <Button
            className="mt-3 bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25"
            onClick={() => addDeadlineMutation.mutate(newDeadline)}
            disabled={!newDeadline.deadlineDate || !newDeadline.coverageStart || !newDeadline.coverageEnd || addDeadlineMutation.isPending}
          >
            <Plus className="w-4 h-4 mr-1" /> Add Deadline
          </Button>
        </div>
      </div>
    </div>
  );
}
