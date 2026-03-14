import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import api from '../lib/api';
import { useToast } from '../hooks/useToast';
import { CircleCheck, CircleX, Filter } from 'lucide-react';

export default function ReviewPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [shiftFilter, setShiftFilter] = useState('all');
  const [decisionNote, setDecisionNote] = useState('');
  const [activeId, setActiveId] = useState(null);

  const { data: pending = [] } = useQuery({
    queryKey: ['pending-requests'],
    queryFn: () => api.get('/requests/pending').then((r) => r.data),
  });

  const { data: allRequests = [] } = useQuery({
    queryKey: ['all-requests', statusFilter, shiftFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (shiftFilter !== 'all') params.append('shift', shiftFilter);
      return api.get(`/requests/all?${params}`).then((r) => r.data);
    },
  });

  const decideMutation = useMutation({
    mutationFn: ({ id, status }) =>
      api.put(`/requests/${id}/decide`, { status, decisionNote: decisionNote || undefined }),
    onSuccess: (_, { status }) => {
      qc.invalidateQueries({ queryKey: ['pending-requests'] });
      qc.invalidateQueries({ queryKey: ['all-requests'] });
      toast.success(`Request ${status}`);
      setDecisionNote('');
      setActiveId(null);
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to decide'),
  });

  // Safely convert a date value (Date object or string) for date-fns
  const toSafeDate = (d) => {
    if (!d) return null;
    if (d instanceof Date) return d;
    // String date like "2024-01-15"
    return new Date(typeof d === 'string' && d.length === 10 ? d + 'T12:00:00' : d);
  };

  const formatDates = (dates) => {
    if (!dates || dates.length === 0) return '—';
    const sorted = [...dates].sort((a, b) => new Date(a) - new Date(b));
    if (sorted.length === 1) return format(toSafeDate(sorted[0]), 'MMM d, yyyy');
    return `${format(toSafeDate(sorted[0]), 'MMM d')} – ${format(toSafeDate(sorted[sorted.length - 1]), 'MMM d, yyyy')}`;
  };

  const getName = (r) => {
    if (r.first_name && r.last_name) return `${r.first_name} ${r.last_name.charAt(0)}.`;
    return r.first_name || '—';
  };

  const statusBadge = (s) => {
    const map = { pending: 'badge-yellow', approved: 'badge-green', denied: 'badge-red', withdrawn: 'badge-gray' };
    return <span className={`badge ${map[s] || 'badge-gray'}`}>{s}</span>;
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Review Requests</h1>

      {/* Pending Queue */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
          Pending Queue ({pending.length})
        </h2>
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Employee</th>
                <th>Type</th>
                <th>Continuity</th>
                <th>Dates</th>
                <th>Days</th>
                <th>Seniority</th>
                <th>Submitted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                    No pending requests
                  </td>
                </tr>
              ) : (
                pending.map((r, idx) => (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                    <td style={{ fontWeight: 500 }}>{getName(r)}</td>
                    <td>
                      <span className={`badge ${r.request_type === 'vacation' ? 'badge-green' : 'badge-blue'}`}>
                        {r.request_type}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{r.continuity_type}</td>
                    <td style={{ fontSize: '0.8125rem' }}>{formatDates(r.dates)}</td>
                    <td style={{ fontSize: '0.8125rem' }}>{r.dates?.length || 0}</td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {r.seniority_date && format(toSafeDate(r.seniority_date), 'MMM yyyy')}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {r.submitted_at && format(toSafeDate(r.submitted_at), 'MMM d, yyyy')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                        {activeId === r.id ? (
                          <>
                            <input
                              type="text"
                              placeholder="Note (optional)"
                              value={decisionNote}
                              onChange={(e) => setDecisionNote(e.target.value)}
                              style={{ width: 140, fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                            />
                            <button
                              className="btn btn-sm"
                              style={{ background: 'var(--success)', color: '#fff', border: 'none' }}
                              onClick={() => decideMutation.mutate({ id: r.id, status: 'approved' })}
                              disabled={decideMutation.isPending}
                            >
                              <CircleCheck size={14} />
                            </button>
                            <button
                              className="btn btn-sm"
                              style={{ background: 'var(--danger)', color: '#fff', border: 'none' }}
                              onClick={() => decideMutation.mutate({ id: r.id, status: 'denied' })}
                              disabled={decideMutation.isPending}
                            >
                              <CircleX size={14} />
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => { setActiveId(null); setDecisionNote(''); }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button className="btn btn-primary btn-sm" onClick={() => setActiveId(r.id)}>
                            Review
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* All Requests History */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>All Requests</h2>
          <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto', alignItems: 'center' }}>
            <Filter size={14} style={{ color: 'var(--text-muted)' }} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ fontSize: '0.8125rem' }}>
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="denied">Denied</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
            <select value={shiftFilter} onChange={(e) => setShiftFilter(e.target.value)} style={{ fontSize: '0.8125rem' }}>
              <option value="all">All shifts</option>
              <option value="AM">AM</option>
              <option value="PM">PM</option>
              <option value="NOC">NOC</option>
            </select>
          </div>
        </div>
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>Dates</th>
                <th>Status</th>
                <th>Decided By</th>
                <th>Decision Note</th>
              </tr>
            </thead>
            <tbody>
              {allRequests.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                    No requests found
                  </td>
                </tr>
              ) : (
                allRequests.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 500 }}>{getName(r)}</td>
                    <td>
                      <span className={`badge ${r.request_type === 'vacation' ? 'badge-green' : 'badge-blue'}`}>
                        {r.request_type}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8125rem' }}>{formatDates(r.dates)}</td>
                    <td>{statusBadge(r.status)}</td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{r.decided_by_name || '—'}</td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.decision_note || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
