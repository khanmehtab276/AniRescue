import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Building2, ClipboardCheck, ClipboardList, LayoutDashboard, LogOut, Map as MapIcon, Menu, Moon, PawPrint, Search, Shield, Siren, Sun, User, Users, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';

const NAV = {
  user: [
    { label: 'Overview', path: '/dashboard', Icon: LayoutDashboard },
    { label: 'Report Rescue', path: '/report', Icon: Siren, primary: true },
    { label: 'My Cases', path: '/dashboard', Icon: ClipboardList },
    { label: 'Rescue Map', path: '/map', Icon: MapIcon },
  ],
  volunteer: [
    { label: 'Rescue Hub', path: '/volunteer', Icon: LayoutDashboard },
    { label: 'Available Cases', path: '/volunteer', Icon: Search },
    { label: 'Active Rescue', path: '/volunteer', Icon: Activity },
    { label: 'Rescue Map', path: '/map', Icon: MapIcon },
  ],
  ngo: [
    { label: 'Operations', path: '/ngo', Icon: LayoutDashboard },
    { label: 'Rescue Cases', path: '/ngo', Icon: ClipboardList },
    { label: 'Volunteers', path: '/ngo', Icon: Users },
    { label: 'Verification', path: '/verification', Icon: ClipboardCheck },
    { label: 'Operations Map', path: '/map', Icon: MapIcon },
  ],
  admin: [
    { label: 'Control Center', path: '/admin', Icon: LayoutDashboard },
    { label: 'All Rescue Cases', path: '/admin', Icon: ClipboardList },
    { label: 'AI Validation', path: '/admin', Icon: Activity },
    { label: 'Verification', path: '/verification', Icon: ClipboardCheck },
    { label: 'Global Map', path: '/map', Icon: MapIcon },
  ],
};

const ROLE_META = {
  user: { label: 'Reporter', Icon: PawPrint },
  volunteer: { label: 'Rescue Volunteer', Icon: Siren },
  ngo: { label: 'NGO Operations', Icon: Building2 },
  admin: { label: 'Administrator', Icon: Shield },
};

function isActivePath(pathname, path) {
  if (path === '/dashboard' || path === '/volunteer' || path === '/ngo' || path === '/admin') return pathname === path;
  return pathname === path || pathname.startsWith(path + '/');
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-3 min-w-0">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm">
        <PawPrint size={21} strokeWidth={2.4} />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-black tracking-tight text-stone-900 dark:text-stone-50">AniRescue</span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Rescue coordination</span>
      </span>
    </Link>
  );
}

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, cycleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const role = (user?.role || '').toLowerCase();
  const links = user ? (NAV[role] || []) : [];
  const meta = ROLE_META[role];
  const ThemeIcon = theme === 'light' ? Sun : Moon;

  const handleLogout = () => {
    setMobileOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-stone-50/95 backdrop-blur-xl dark:border-stone-800/80 dark:bg-stone-950/95">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-8">
            <Brand />
            {user && meta && (
              <div className="hidden items-center gap-2 border-l border-stone-200 pl-6 dark:border-stone-800 lg:flex">
                <meta.Icon size={15} className="text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-bold text-stone-600 dark:text-stone-300">{meta.label}</span>
              </div>
            )}
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            {user && (
              <div className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white p-1 dark:border-stone-800 dark:bg-stone-900">
                {links.slice(0, 3).map(({ label, path, Icon, primary }) => {
                  const active = isActivePath(location.pathname, path);
                  return (
                    <Link key={label} to={path} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${primary ? 'bg-emerald-600 text-white hover:bg-emerald-700' : active ? 'bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-white' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-white'}`}>
                      <Icon size={15} strokeWidth={2.4} />{label}
                    </Link>
                  );
                })}
              </div>
            )}

            <button type="button" onClick={cycleTheme} className="grid h-10 w-10 place-items-center rounded-xl border border-stone-200 bg-white text-stone-500 hover:text-stone-900 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400 dark:hover:text-white" aria-label="Change theme">
              <ThemeIcon size={17} />
            </button>

            {user ? (
              <>
                <Link to="/profile" className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 dark:border-stone-800 dark:bg-stone-900">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><User size={15} /></span>
                  <span className="max-w-[130px] truncate text-xs font-bold text-stone-700 dark:text-stone-200">{user.name || 'Account'}</span>
                </Link>
                <button type="button" onClick={handleLogout} className="grid h-10 w-10 place-items-center rounded-xl border border-stone-200 bg-white text-stone-400 hover:text-rose-600 dark:border-stone-800 dark:bg-stone-900" aria-label="Log out"><LogOut size={16} /></button>
              </>
            ) : (
              <Link to="/login" className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700">Sign in</Link>
            )}
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <button type="button" onClick={cycleTheme} className="grid h-10 w-10 place-items-center rounded-xl border border-stone-200 bg-white text-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400" aria-label="Change theme"><ThemeIcon size={17} /></button>
            <button type="button" onClick={() => setMobileOpen((value) => !value)} className="grid h-10 w-10 place-items-center rounded-xl border border-stone-200 bg-white text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200" aria-label={mobileOpen ? 'Close menu' : 'Open menu'}>
              {mobileOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </div>

        {mobileOpen && user && (
          <div className="border-t border-stone-200 bg-white px-4 py-4 dark:border-stone-800 dark:bg-stone-900 lg:hidden">
            <div className="mb-3 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600">{meta ? <meta.Icon size={19} /> : <User size={19} />}</div>
              <div><p className="text-sm font-extrabold text-stone-900 dark:text-stone-100">{user.name || 'Account'}</p><p className="text-xs text-stone-400">{meta?.label || 'AniRescue'}</p></div>
            </div>
            <nav className="grid gap-1">
              {links.map(({ label, path, Icon, primary }) => (
                <Link key={label} to={path} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold ${primary ? 'bg-emerald-600 text-white' : isActivePath(location.pathname, path) ? 'bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-white' : 'text-stone-600 dark:text-stone-300'}`}>
                  <Icon size={18} />{label}
                </Link>
              ))}
              <Link to="/profile" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-stone-600 dark:text-stone-300"><User size={18} /> Profile</Link>
              <button type="button" onClick={handleLogout} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold text-rose-600 dark:text-rose-400"><LogOut size={18} /> Log out</button>
            </nav>
          </div>
        )}
      </header>

      {user && (
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl dark:border-stone-800 dark:bg-stone-950/95 lg:hidden">
          <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
            {links.slice(0, 4).map(({ label, path, Icon, primary }) => {
              const active = isActivePath(location.pathname, path);
              return (
                <Link key={label} to={path} className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-bold ${primary ? 'text-emerald-600 dark:text-emerald-400' : active ? 'bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-white' : 'text-stone-400'}`}>
                  <Icon size={18} strokeWidth={2.3} /><span className="truncate max-w-full">{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
