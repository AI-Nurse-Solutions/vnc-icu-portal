import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Calendar, FileText, Users, Settings, LogOut, Shield, BarChart3 } from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/calendar', label: 'Calendar', icon: Calendar, roles: ['employee', 'manager', 'admin'] },
    { to: '/requests', label: 'My Requests', icon: FileText, roles: ['employee', 'manager', 'admin'] },
    { to: '/review', label: 'Review', icon: Shield, roles: ['manager', 'admin'] },
    { to: '/admin', label: 'Admin', icon: Settings, roles: ['admin'] },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <nav style={{
        width: 240, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', padding: '1.5rem 0', flexShrink: 0,
      }}>
        <div style={{ padding: '0 1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--accent)' }}>VNC ICU</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Vacation Portal</div>
        </div>

        <div style={{ flex: 1, padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {navItems
            .filter((item) => item.roles.includes(user?.role))
            .map((item) => (
              <NavLink key={item.to} to={item.to} style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.75rem',
                borderRadius: 'var(--radius)', fontSize: '0.875rem', fontWeight: 500,
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                background: isActive ? 'var(--accent-muted)' : 'transparent',
                textDecoration: 'none', transition: 'all 0.15s',
              })}>
                <item.icon size={18} />
                {item.label}
              </NavLink>
            ))}
        </div>

        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-primary)' }}>
            {user?.firstName} {user?.lastName}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            {user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1)} · {user?.shift}
          </div>
          <button onClick={handleLogout} className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
            <LogOut size={14} /> Logout
          </button>
        </div>
      </nav>

      {/* Main */}
      <main style={{ flex: 1, padding: '2rem', overflowY: 'auto', maxHeight: '100vh' }}>
        <Outlet />
      </main>
    </div>
  );
}
