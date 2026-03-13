import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth, isToday } from 'date-fns';
import api from '../lib/api';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import clsx from 'clsx';

const SHIFTS = ['AM', 'PM', 'NOC'];

function getDemandColor(count, yellowThreshold, redThreshold) {
  if (count >= redThreshold) return 'var(--cal-red)';
  if (count >= yellowThreshold) return 'var(--cal-yellow)';
  return 'var(--cal-green)';
}

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedShift, setSelectedShift] = useState('AM');

  const monthStr = format(currentMonth, 'yyyy-MM');

  const { data: demand } = useQuery({
    queryKey: ['calendar-demand', monthStr],
    queryFn: () => api.get(`/calendar/demand?month=${monthStr}`).then((r) => r.data),
  });

  const { data: drillDown } = useQuery({
    queryKey: ['calendar-drilldown', selectedDate],
    queryFn: () => api.get(`/calendar/date/${selectedDate}`).then((r) => r.data),
    enabled: !!selectedDate,
  });

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const startDay = getDay(startOfMonth(currentMonth));

  const demandMap = {};
  demand?.days?.forEach((d) => { demandMap[d.date] = d; });
  const config = demand?.config || {};
  const yellowThreshold = config.color_yellow_threshold || 5;
  const redThreshold = config.color_red_threshold || 8;
  const blackoutSet = new Set(demand?.blackouts?.map((b) => b.date) || []);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Calendar</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft size={16} /></button>
          <span style={{ fontWeight: 600, minWidth: 140, textAlign: 'center' }}>{format(currentMonth, 'MMMM yyyy')}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight size={16} /></button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', fontSize: '0.8125rem' }}>
        {SHIFTS.map((s) => (
          <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: selectedShift === s ? 'var(--accent)' : 'var(--text-secondary)' }}
            onClick={() => setSelectedShift(s)}>
            <input type="radio" name="shift" checked={selectedShift === s} onChange={() => setSelectedShift(s)} style={{ display: 'none' }} />
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: selectedShift === s ? 'var(--accent)' : 'var(--bg-tertiary)', border: '2px solid var(--border)' }} />
            {s}
          </label>
        ))}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.75rem', color: 'var(--text-muted)' }}>
          <span>🟢 0–{yellowThreshold - 1}</span>
          <span>🟡 {yellowThreshold}–{redThreshold - 1}</span>
          <span>🔴 {redThreshold}+</span>
        </span>
      </div>

      {/* Calendar Grid */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{d}</div>
          ))}
          {Array.from({ length: startDay }).map((_, i) => <div key={`e-${i}`} style={{ minHeight: 80, borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} />)}
          {days.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayData = demandMap[dateStr];
            const shiftKey = `${selectedShift.toLowerCase()}_count`;
            const count = dayData?.[shiftKey] || 0;
            const isBlackout = blackoutSet.has(dateStr);
            const isSelected = selectedDate === dateStr;
            return (
              <div key={dateStr} onClick={() => setSelectedDate(dateStr)} style={{
                minHeight: 80, padding: '0.375rem 0.5rem', cursor: 'pointer',
                borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                background: isSelected ? 'var(--accent-muted)' : isBlackout ? 'rgba(239,68,68,0.08)' : 'transparent',
                transition: 'background 0.15s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: isToday(day) ? 700 : 400, color: isToday(day) ? 'var(--accent)' : 'var(--text-primary)' }}>
                    {format(day, 'd')}
                  </span>
                  {isBlackout && <span style={{ fontSize: '0.625rem', color: 'var(--danger)', fontWeight: 600 }}>BLOCKED</span>}
                </div>
                {count > 0 && (
                  <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: getDemandColor(count, yellowThreshold, redThreshold) }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{count}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Drill-down */}
      {selectedDate && drillDown && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            {format(new Date(selectedDate + 'T12:00:00'), 'EEEE, MMMM d, yyyy')}
          </h3>
          {SHIFTS.map((shift) => {
            const items = drillDown.requests?.filter((r) => r.shift === shift) || [];
            return (
              <div key={shift} style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{shift} Shift ({items.length})</div>
                {items.length === 0 ? (
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No approved requests</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                    {items.map((r, i) => (
                      <span key={i} className={`badge badge-${r.request_type === 'education' ? 'blue' : 'green'}`}>
                        {r.display_name} · {r.request_type}
                      </span>
                    ))}
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
