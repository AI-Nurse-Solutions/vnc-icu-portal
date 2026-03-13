import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import api from '../lib/api';
import { useToast } from '../hooks/useToast';
import { Settings, Users, Upload, CalendarOff, Clock, FileText, Download, Trash2, Save, Plus } from 'lucide-react';

const TABS = [
  { key: 'config', label: 'Configuration', icon: Settings },
  { key: 'employees', label: 'Employees', icon: Users },
  { key: 'import', label: 'CSV Import', icon: Upload },
  { key: 'blackouts', label: 'Blackout Dates', icon: CalendarOff },
  { key: 'deadlines', label: 'Deadlines', icon: Clock },
  { key: 'audit', label: 'Audit Log', icon: FileText },
  { key: 'export', label: 'Export', icon: Download },
];

export default function AdminPage() {
  const [tab, setTab] = useState('config');

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Admin Panel</h1>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: 2 }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={tab === t.key ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
              style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'config' && <ConfigTab />}
      {tab === 'employees' && <EmployeesTab />}
      {tab === 'import' && <ImportTab />}
      {tab === 'blackouts' && <BlackoutsTab />}
      {tab === 'deadlines' && <DeadlinesTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'export' && <ExportTab />}
    </div>
  );
}

/* ─── Config Tab ─── */
function ConfigTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: configs = [] } = useQuery({
    queryKey: ['admin-config'],
    queryFn: () => api.get('/admin/config').then((r) => r.data),
  });

  const updateMut = useMutation({
    mutationFn: ({ key, value }) => api.put('/admin/config', { key, value }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-config'] }); toast.success('Config updated'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  const [edits, setEdits] = useState({});
  const handleSave = (key) => {
    updateMut.mutate({ key, value: edits[key] });
  };

  return (
    <div className="card">
      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>System Configuration</h3>
      <table>
        <thead>
          <tr><th>Key</th><th>Value</th><th></th></tr>
        </thead>
        <tbody>
          {configs.map((c) => (
            <tr key={c.key}>
              <td style={{ fontWeight: 500, fontSize: '0.875rem' }}>{c.key.replace(/_/g, ' ')}</td>
              <td>
                <input
                  style={{ width: 120, fontSize: '0.875rem' }}
                  defaultValue={c.value}
                  onChange={(e) => setEdits({ ...edits, [c.key]: e.target.value })}
                />
              </td>
              <td>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleSave(c.key)}
                  disabled={!edits[c.key]}
                >
                  <Save size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Employees Tab ─── */
function EmployeesTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: employees = [] } = useQuery({
    queryKey: ['admin-employees'],
    queryFn: () => api.get('/admin/employees').then((r) => r.data),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/admin/employees/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-employees'] }); toast.success('Employee updated'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  return (
    <div className="card" style={{ padding: 0 }}>
      <table>
        <thead>
          <tr><th>Name</th><th>Email</th><th>Role</th><th>Shift</th><th>Seniority</th><th>Active</th><th></th></tr>
        </thead>
        <tbody>
          {employees.map((emp) => (
            <EmployeeRow key={emp.id} emp={emp} onUpdate={(data) => updateMut.mutate({ id: emp.id, data })} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmployeeRow({ emp, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(emp.role);
  const [shift, setShift] = useState(emp.shift);
  const [active, setActive] = useState(emp.is_active);

  if (!editing) {
    return (
      <tr>
        <td style={{ fontWeight: 500 }}>{emp.first_name} {emp.last_name}</td>
        <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{emp.email}</td>
        <td><span className={`badge ${emp.role === 'admin' ? 'badge-red' : emp.role === 'manager' ? 'badge-yellow' : 'badge-blue'}`}>{emp.role}</span></td>
        <td style={{ fontSize: '0.8125rem' }}>{emp.shift}</td>
        <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
          {emp.seniority_date && format(new Date(emp.seniority_date + 'T12:00:00'), 'MMM yyyy')}
        </td>
        <td>{emp.is_active ? <span className="badge badge-green">Yes</span> : <span className="badge badge-red">No</span>}</td>
        <td><button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Edit</button></td>
      </tr>
    );
  }

  return (
    <tr>
      <td style={{ fontWeight: 500 }}>{emp.first_name} {emp.last_name}</td>
      <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{emp.email}</td>
      <td>
        <select value={role} onChange={(e) => setRole(e.target.value)} style={{ fontSize: '0.75rem' }}>
          <option value="employee">employee</option>
          <option value="manager">manager</option>
          <option value="admin">admin</option>
        </select>
      </td>
      <td>
        <select value={shift} onChange={(e) => setShift(e.target.value)} style={{ fontSize: '0.75rem' }}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
          <option value="NOC">NOC</option>
        </select>
      </td>
      <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
        {emp.seniority_date && format(new Date(emp.seniority_date + 'T12:00:00'), 'MMM yyyy')}
      </td>
      <td>
        <select value={active ? 'yes' : 'no'} onChange={(e) => setActive(e.target.value === 'yes')} style={{ fontSize: '0.75rem' }}>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </td>
      <td style={{ display: 'flex', gap: '0.25rem' }}>
        <button className="btn btn-primary btn-sm" onClick={() => { onUpdate({ role, shift, isActive: active }); setEditing(false); }}>Save</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>X</button>
      </td>
    </tr>
  );
}

/* ─── Import Tab ─── */
function ImportTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [csvText, setCsvText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    if (!csvText.trim()) { toast.error('Paste CSV data first'); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/admin/employees/import', { csvData: csvText });
      toast.success(`Imported ${data.imported} employees`);
      qc.invalidateQueries({ queryKey: ['admin-employees'] });
      setCsvText('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Import Employees via CSV</h3>
      <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Paste CSV with headers: first_name, last_name, email, role, shift, seniority_date
      </p>
      <textarea
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
        rows={8}
        placeholder="first_name,last_name,email,role,shift,seniority_date&#10;Jane,Doe,jane@example.com,employee,AM,2020-01-15"
        style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8125rem', marginBottom: '0.75rem' }}
      />
      <button className="btn btn-primary" onClick={handleImport} disabled={loading}>
        <Upload size={16} /> {loading ? 'Importing…' : 'Import'}
      </button>
    </div>
  );
}

/* ─── Blackouts Tab ─── */
function BlackoutsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: blackouts = [] } = useQuery({
    queryKey: ['admin-blackouts'],
    queryFn: () => api.get('/calendar/blackouts').then((r) => r.data),
  });

  const [newDate, setNewDate] = useState('');
  const [newReason, setNewReason] = useState('');

  const addMut = useMutation({
    mutationFn: () => api.post('/admin/blackouts', { date: newDate, reason: newReason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-blackouts'] }); toast.success('Blackout added'); setNewDate(''); setNewReason(''); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/admin/blackouts/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-blackouts'] }); toast.success('Blackout removed'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  return (
    <div className="card">
      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Blackout Dates</h3>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
        <input type="text" placeholder="Reason" value={newReason} onChange={(e) => setNewReason(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <button className="btn btn-primary" onClick={() => addMut.mutate()} disabled={!newDate || addMut.isPending}>
          <Plus size={16} /> Add
        </button>
      </div>
      <table>
        <thead>
          <tr><th>Date</th><th>Reason</th><th></th></tr>
        </thead>
        <tbody>
          {blackouts.length === 0 ? (
            <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem' }}>No blackout dates</td></tr>
          ) : blackouts.map((b) => (
            <tr key={b.id}>
              <td style={{ fontWeight: 500 }}>{format(new Date(b.date + 'T12:00:00'), 'MMM d, yyyy')}</td>
              <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{b.reason || '—'}</td>
              <td>
                <button className="btn btn-secondary btn-sm" onClick={() => delMut.mutate(b.id)} style={{ color: 'var(--danger)' }}>
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Deadlines Tab ─── */
function DeadlinesTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: deadlines = [] } = useQuery({
    queryKey: ['admin-deadlines'],
    queryFn: () => api.get('/calendar/deadlines').then((r) => r.data),
  });

  const [form, setForm] = useState({ deadlineDate: '', coverageStart: '', coverageEnd: '', year: new Date().getFullYear() });

  const addMut = useMutation({
    mutationFn: () => api.post('/admin/deadlines', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-deadlines'] }); toast.success('Deadline added'); setForm({ deadlineDate: '', coverageStart: '', coverageEnd: '', year: new Date().getFullYear() }); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/admin/deadlines/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-deadlines'] }); toast.success('Deadline removed'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  return (
    <div className="card">
      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Submission Deadlines</h3>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: '0.75rem' }}>Deadline Date</label>
          <input type="date" value={form.deadlineDate} onChange={(e) => setForm({ ...form, deadlineDate: e.target.value })} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: '0.75rem' }}>Coverage Start</label>
          <input type="date" value={form.coverageStart} onChange={(e) => setForm({ ...form, coverageStart: e.target.value })} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: '0.75rem' }}>Coverage End</label>
          <input type="date" value={form.coverageEnd} onChange={(e) => setForm({ ...form, coverageEnd: e.target.value })} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: '0.75rem' }}>Year</label>
          <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} style={{ width: 80 }} />
        </div>
        <button className="btn btn-primary" onClick={() => addMut.mutate()} disabled={!form.deadlineDate || addMut.isPending}>
          <Plus size={16} /> Add
        </button>
      </div>
      <table>
        <thead>
          <tr><th>Deadline</th><th>Coverage Start</th><th>Coverage End</th><th>Year</th><th></th></tr>
        </thead>
        <tbody>
          {deadlines.length === 0 ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem' }}>No deadlines set</td></tr>
          ) : deadlines.map((d) => (
            <tr key={d.id}>
              <td style={{ fontWeight: 500 }}>{format(new Date(d.deadline_date + 'T12:00:00'), 'MMM d, yyyy')}</td>
              <td style={{ fontSize: '0.8125rem' }}>{format(new Date(d.coverage_start + 'T12:00:00'), 'MMM d, yyyy')}</td>
              <td style={{ fontSize: '0.8125rem' }}>{format(new Date(d.coverage_end + 'T12:00:00'), 'MMM d, yyyy')}</td>
              <td>{d.year}</td>
              <td>
                <button className="btn btn-secondary btn-sm" onClick={() => delMut.mutate(d.id)} style={{ color: 'var(--danger)' }}>
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Audit Log Tab ─── */
function AuditTab() {
  const { data: logs = [] } = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => api.get('/admin/audit-log').then((r) => r.data),
  });

  return (
    <div className="card" style={{ padding: 0 }}>
      <table>
        <thead>
          <tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No audit entries</td></tr>
          ) : logs.map((l) => (
            <tr key={l.id}>
              <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {l.created_at && format(new Date(l.created_at), 'MMM d HH:mm')}
              </td>
              <td style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{l.actor_name || l.actor_id}</td>
              <td><span className="badge badge-blue">{l.action}</span></td>
              <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                {l.target_type} {l.target_id ? `#${l.target_id}` : ''}
              </td>
              <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {l.details ? JSON.stringify(l.details) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Export Tab ─── */
function ExportTab() {
  const toast = useToast();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [shift, setShift] = useState('');
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (shift) params.append('shift', shift);
      const { data } = await api.get(`/admin/requests/export?${params}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `approved_requests_${startDate || 'all'}_${endDate || 'all'}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch (err) {
      toast.error('Export failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Export Approved Requests</h3>
      <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Download a CSV of approved requests for the selected date range.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: '0.75rem' }}>Start Date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: '0.75rem' }}>End Date</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: '0.75rem' }}>Shift</label>
          <select value={shift} onChange={(e) => setShift(e.target.value)}>
            <option value="">All</option>
            <option value="AM">AM</option>
            <option value="PM">PM</option>
            <option value="NOC">NOC</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={handleExport} disabled={loading}>
          <Download size={16} /> {loading ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>
    </div>
  );
}
