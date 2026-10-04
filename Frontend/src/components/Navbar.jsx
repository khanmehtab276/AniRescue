import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Building2, ClipboardCheck, ClipboardList, LayoutDashboard, LogOut, Map as MapIcon, Menu, MessageSquareHeart, Moon, PawPrint, Search, Shield, Siren, Sun, User, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import NotificationBell from './NotificationBell.jsx';

const NAV = {
  user: [
    { label: 'Overview', path: '/dashboard', Icon: LayoutDashboard },
    { label: 'Report Rescue', path: '/report', Icon: Siren, primary: true },
    { label: 'My Cases', path: '/dashboard/cases', Icon: ClipboardList },
    { label: 'Rescue Map', path: '/map', Icon: MapIcon },
    { label: 'Feedback', path: '/feedback', Icon: MessageSquareHeart },
  ],
  volunteer: [
    { label: 'Rescue Hub', path: '/volunteer', Icon: LayoutDashboard },
    { label: 'Report Rescue', path: '/report', Icon: Siren, primary: true },
    { label: 'Available Cases', path: '/volunteer/cases', Icon: Search },
    { label: 'Active Rescue', path: '/volunteer/active', Icon: Activity },
    { label: 'Rescue History', path: '/volunteer/history', Icon: ClipboardList },
    { label: 'Rescue Map', path: '/map', Icon: MapIcon },
    { label: 'Feedback', path: '/feedback', Icon: MessageSquareHeart },
  ],
  ngo: [
    { label: 'Operations', path: '/ngo', Icon: LayoutDashboard },
    { label: 'Report Rescue', path: '/report', Icon: Siren, primary: true },
    { label: 'Rescue Cases', path: '/ngo/cases', Icon: ClipboardList },
    { label: 'Volunteers', path: '/ngo/volunteers', Icon: Users },
    { label: 'Verification', path: '/verification', Icon: ClipboardCheck },
    { label: 'Operations Map', path: '/map', Icon: MapIcon },
    { label: 'Feedback', path: '/feedback', Icon: MessageSquareHeart },
  ],
  admin: [
    { label: 'Control Center', path: '/admin', Icon: LayoutDashboard },
    { label: 'Report Rescue', path: '/report', Icon: Siren, primary: true },
    { label: 'All Rescue Cases', path: '/admin/cases', Icon: ClipboardList },
    { label: 'AI Validation', path: '/admin/ai-validation', Icon: Activity },
    { label: 'Verification', path: '/verification', Icon: ClipboardCheck },
    { label: 'Global Map', path: '/map', Icon: MapIcon },
    { label: 'Feedback', path: '/feedback', Icon: MessageSquareHeart },
  ],
};

const ROLE_META = {
  user: { label: 'Reporter', Icon: PawPrint, accent: 'emerald' },
  volunteer: { label: 'Rescue Volunteer', Icon: Siren, accent: 'amber' },
  ngo: { label: 'NGO Operations', Icon: Building2, accent: 'blue' },
  admin: { label: 'Administrator', Icon: Shield, accent: 'violet' },
};

function isActivePath(pathname, path) {
  if (path === '/dashboard' || path === '/volunteer' || path === '/ngo' || path === '/admin') return pathname === path;
  return pathname === path || pathname.startsWith(path + '/');
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-3 min-w-0">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-sm"><PawPrint size={21} strokeWidth={2.4} /></span>
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
  const [menuOpen, setMenuOpen] = useState(false);
  const role = (user?.role || '').toLowerCase();
  const links = user ? (NAV[role] || []) : [];
  const meta = ROLE_META[role];
  const ThemeIcon = theme === 'light' ? Sun : Moon;

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-stone-50/90 backdrop-blur-xl dark:border-stone-800/80 dark:bg-stone-950/90">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-8">
            <Brand />
            {user && meta && <div className="hidden items-center gap-2 border-l border-stone-200 pl-6 dark:border-stone-800 md:flex"><meta.Icon size={15} className={{ emerald: 'text-emerald-600 dark:text-emerald-400', amber: 'text-amber-600 dark:text-amber-400', blue: 'text-blue-600 dark:text-blue-400', violet: 'text-violet-600 dark:text-violet-400' }[meta.accent] || 'text-emerald-600 dark:text-emerald-400'} /><span className="text-sm font-bold text-stone-600 dark:text-stone-300">{meta.label}</span></div>}
          </div>
          <div className="flex items-center gap-2">{user && <NotificationBell />}
            {user && <button type="button" onClick={() => setMenuOpen((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 text-stone-800 shadow-[0_4px_14px_rgba(28,25,23,0.10)] transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:text-emerald-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:shadow-[0_4px_16px_rgba(0,0,0,0.30)] dark:hover:border-emerald-700 dark:hover:text-emerald-400" aria-expanded={menuOpen} aria-controls="rescue-navigation" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}>{menuOpen ? <X size={18} /> : <Menu size={18} />}<span className="hidden text-xs font-extrabold sm:inline">Menu</span></button>}
            <button type="button" onClick={cycleTheme} className="grid h-10 w-10 place-items-center rounded-xl border border-stone-200 bg-white text-stone-500 transition-all hover:-translate-y-0.5 hover:text-stone-900 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400 dark:hover:text-white" aria-label="Change theme"><ThemeIcon size={17} /></button>
            {user ? <><Link to="/profile" className="hidden items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 transition-colors hover:border-emerald-300 dark:border-stone-800 dark:bg-stone-900 sm:flex"><span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><User size={15} /></span><span className="max-w-[130px] truncate text-xs font-bold text-stone-700 dark:text-stone-200">{user.name || 'Account'}</span></Link><button type="button" onClick={handleLogout} className="hidden h-10 w-10 place-items-center rounded-xl border border-stone-200 bg-white text-stone-400 transition-colors hover:text-rose-600 dark:border-stone-800 dark:bg-stone-900 sm:grid" aria-label="Log out"><LogOut size={16} /></button></> : <Link to="/login" className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-emerald-700">Sign in</Link>}
          </div>
        </div>
        {menuOpen && user && <>
          <button type="button" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-[55] cursor-default bg-stone-950/10 backdrop-blur-md dark:bg-black/20" />
          <div id="rescue-navigation" className="absolute right-4 top-[4.5rem] z-[60] w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-stone-200 bg-white/95 p-3 shadow-2xl shadow-stone-950/20 ring-1 ring-black/5 animate-rescue-popover dark:border-stone-800 dark:bg-stone-900/95 sm:right-6 lg:right-8">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-stone-50 p-3 dark:bg-stone-950"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">{meta ? <meta.Icon size={20} /> : <User size={20} />}</div><div className="min-w-0"><p className="truncate text-sm font-extrabold text-stone-900 dark:text-stone-100">{user.name || 'Account'}</p><p className="text-xs font-semibold text-stone-400">{meta?.label || 'AniRescue'}</p></div></div>
          <nav className="grid gap-0 rounded-xl">
            {links.map(({ label, path, Icon, primary }) => { const active = isActivePath(location.pathname, path); const classes = primary ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700' : active ? 'bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-white' : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'; return <Link key={label} to={path} onClick={() => setMenuOpen(false)} className={'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition-all hover:translate-x-0.5 ' + classes}><Icon size={18} /><span>{label}</span></Link>; })}
            <div className="my-1 border-t border-stone-200 dark:border-stone-800" />
            <Link to="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"><User size={18} /> Profile</Link>
            <button type="button" onClick={handleLogout} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"><LogOut size={18} /> Log out</button>
          </nav>
          </div>
        </>}
      </header>
    </>
  );
}