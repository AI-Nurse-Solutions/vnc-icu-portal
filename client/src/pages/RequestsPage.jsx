import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, eachDayOfInterval, parseISO } from 'date-fns';
import api from '../lib/api';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { Plus, X } from 'lucide-react';

const toSafeDate = (d) => {
  if (!d) return null;
  if (d instanceof Date) return d;
  return new Date(typeof d === 'string' && d.length === 10 ? d + 'T12:00:00' : d);
};

export default function RequestsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: requests = [] } = useQuery({
    queryKey: ['my-requests'],
    queryFn: () => api.get('/requests/my').then((r) => r.data),
  });

  const withdrawMutation = useMutation({
    mutationFn: (id) => api.put(`/requests/${id}/withdraw`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-requests'] }); toast.success('Request withdrawn'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to withdraw'),
  });

  const statusBadge = (s) => {
    const map = { pending: 'badge-yellow', approved: 'badge-green', denied: 'badge-red', withdrawn: 'badge-gray' };
    return <span className={`badge ${map[s] || 'badge-gray'}`}>{s}</span>;
  };

  const formatDates = (dates) => {
    if (!dates || dates.length === 0) return '—';
    const sorted = [...dates].sort((a, b) => new Date(a) - new Date(b));
    if (sorted.length === 1) return format(toSafeDate(sorted[0]), 'MMM d, yyyy');
    return `${format(toSafeDate(sorted[0]), 'MMM d')} – ${format(toSafeDate(sorted[sorted.length - 1]), 'MMM d, yyyy')}`;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>My Requests</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> New Request</button>
      </div>

      {showForm && <RequestForm onClose={() => setShowForm(false)} onSuccess={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['my-requests'] }); }} />}

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Type</th><th>Priority</th><th>Continuity</th><th>Dates</th><th>Days</th><th>Status</th><th>Submitted</th><th></th></tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No requests yet</td></tr>
            ) : requests.map((r) => (
              <tr key={r.id}>
                <td><span className={`badge ${r.request_type === 'vacation' ? 'badge-green' : 'badge-blue'}`}>{r.request_type}</span></td>
                <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{r.priority || '—'}</td>
                <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{r.continuity_type}</td>
                <td style={{ fontSize: '0.8125rem' }}>{formatDates(r.dates)}</td>
                <td style={{ fontSize: '0.8125rem' }}>{r.dates?.length || 0}</td>
                <td>{statusBadge(r.status)}</td>
                <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{r.submitted_at && format(new Date(r.submitted_at), 'MMM d, yyyy')}</td>
                <td>
                  {(r.status === 'pending' || r.status === 'approved') && (
                    <button className="btn btn-secondary btn-sm" onClick={() => withdrawMutation.mutate(r.id)}>Withdraw</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RequestForm({ onClose, onSuccess }) {
  const toast = useToast();
  const [formData, setFormData] = useState({
    requestType: 'vacation',
    continuityType: 'continuous',
    priority: '',
    startDate: '',
    endDate: '',
    comment: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.startDate || !formData.endDate) { toast.error('Please select dates'); return; }
    if (formData.requestType === 'vacation' && !formData.priority) { toast.error('Please select a priority'); return; }

    // Convert date range to array of date strings (YYYY-MM-DD)
    const start = parseISO(formData.startDate);
    const end = parseISO(formData.endDate);
    if (end < start) { toast.error('End date must be after start date'); return; }

    const dates = eachDayOfInterval({ start, end }).map((d) => format(d, 'yyyy-MM-dd'));

    setLoading(true);
    try {
      await api.post('/requests', {
        requestType: formData.requestType,
        continuityType: formData.continuityType,
        dates,
        comment: formData.comment || undefined,
        priority: formData.requestType === 'vacation' ? parseInt(formData.priority) : undefined,
      });
      toast.success('Request submitted!');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>New Request</h3>
        <button onClick={onClose} style={{ background: 'none', color: 'var(--text-muted)' }}><X size={18} /></button>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="form-group">
          <label>Type</label>
          <select value={formData.requestType} onChange={(e) => setFormData({ ...formData, requestType: e.target.value })}>
            <option value="vacation">Vacation</option>
            <option value="education">Education</option>
          </select>
        </div>
        <div className="form-group">
          <label>Continuity</label>
          <select value={formData.continuityType} onChange={(e) => setFormData({ ...formData, continuityType: e.target.value })}>
            <option value="continuous">Continuous</option>
            <option value="intermittent">Intermittent</option>
          </select>
        </div>
        {formData.requestType === 'vacation' && (
          <div className="form-group">
            <label>Priority</label>
            <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value })} required>
              <option value="">Select priority…</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        )}
        <div className="form-group">
          <label>Start Date</label>
          <input type="date" value={formData.startDate} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} required />
        </div>
        <div className="form-group">
          <label>End Date</label>
          <input type="date" value={formData.endDate} onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} required />
        </div>
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label>Notes (optional)</label>
          <textarea value={formData.comment} onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
            rows={2} placeholder="Any additional notes…" />
        </div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Submitting…' : 'Submit Request'}</button>
        </div>
      </form>
    </div>
  );
}
