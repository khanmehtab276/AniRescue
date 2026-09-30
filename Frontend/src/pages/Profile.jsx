import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import NotificationSettings from '../components/NotificationSettings.jsx';

const ROLE_META = {
  user: { label: 'Animal Reporter', icon: '🐾', description: 'Report animals that need rescue or assistance.' },
  volunteer: { label: 'Rescue Volunteer', icon: '🦺', description: 'Help rescue animals and manage assigned cases.' },
  ngo: { label: 'NGO Operations', icon: '🏥', description: 'Coordinate rescue activities and volunteers.' },
  admin: { label: 'Administrator', icon: '🛡️', description: 'Manage AniRescue operations and accounts.' },
};
const STATUS_CLASS = {
  ACTIVE: 'text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:ring-emerald-900',
  PENDING: 'text-amber-700 bg-amber-50 ring-1 ring-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:ring-amber-900',
  REJECTED: 'text-rose-700 bg-rose-50 ring-1 ring-rose-200 dark:text-rose-300 dark:bg-rose-950/40 dark:ring-rose-900',
  SUSPENDED: 'text-red-700 bg-red-50 ring-1 ring-red-200 dark:text-red-300 dark:bg-red-950/40 dark:ring-red-900',
};
function InfoRow({ label, value }) {
  return <div className="flex flex-col gap-1 border-b border-stone-100 py-4 last:border-0 dark:border-stone-800 sm:flex-row sm:items-center sm:justify-between sm:gap-6"><span className="text-xs font-black uppercase tracking-[0.12em] text-stone-400">{label}</span><span className="break-all text-sm font-bold text-stone-800 dark:text-stone-100 sm:text-right">{value}</span></div>;
}
function RoleDetails({ role, user }) {
  if (role === 'ngo') {
    const configured = user.jurisdiction_lat !== null && user.jurisdiction_lat !== undefined;
    return <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Operating area</p><p className="mt-1 text-sm font-bold text-stone-800 dark:text-stone-100">{configured ? 'Configured service area' : 'Setup required'}</p></div><button type="button" onClick={() => window.location.assign('/ngo')} className="text-xs font-black text-emerald-700 hover:text-emerald-800 dark:text-emerald-300">Manage area →</button></div><p className="mt-2 text-xs leading-5 text-stone-500 dark:text-stone-400">{configured ? 'Your NGO case feed is filtered by the operating area configured in the workspace.' : 'Configure your location and service radius in the NGO workspace to start receiving jurisdiction-scoped cases.'}</p></div>;
  }
  if (role === 'volunteer') return <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-stone-50 p-4 dark:bg-stone-950"><p className="text-xs font-black uppercase tracking-wider text-stone-400">Availability</p><p className="mt-1 text-sm font-black text-stone-800 dark:text-stone-100">{user.availability || 'Not set'}</p></div><div className="rounded-2xl bg-stone-50 p-4 dark:bg-stone-950"><p className="text-xs font-black uppercase tracking-wider text-stone-400">Location</p><p className="mt-1 text-sm font-black text-stone-800 dark:text-stone-100">{user.location_updated_at ? 'Location updated' : 'Not updated'}</p></div></div>;
  if (role === 'admin') return <div className="mt-5 rounded-2xl bg-stone-50 p-4 dark:bg-stone-950"><p className="text-xs font-black uppercase tracking-wider text-stone-400">Access</p><p className="mt-1 text-sm font-bold text-stone-800 dark:text-stone-100">Administrative account with global operational permissions.</p></div>;
  return <div className="mt-5 rounded-2xl bg-stone-50 p-4 dark:bg-stone-950"><p className="text-xs font-black uppercase tracking-wider text-stone-400">Rescue role</p><p className="mt-1 text-sm font-bold text-stone-800 dark:text-stone-100">Your reported cases and rescue progress are available from My Cases.</p></div>;
}
export default function Profile() {
  const { user, logout } = useAuth(); const navigate = useNavigate(); if (!user) return null;
  const role = (user.role || 'user').toLowerCase(); const accountStatus = (user.account_status || 'ACTIVE').toUpperCase(); const meta = ROLE_META[role] || ROLE_META.user;
  const handleLogout = () => { logout(); navigate('/login'); };
  return <main className="min-h-[75vh] px-4 pb-24 sm:px-6 lg:px-8 lg:pb-10"><div className="mx-auto max-w-5xl py-6 lg:py-10">
    <section className="relative overflow-hidden rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-8"><div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" /><div className="relative flex flex-col gap-6 sm:flex-row sm:items-center"><div className="grid h-24 w-24 shrink-0 place-items-center rounded-[1.75rem] bg-emerald-50 text-4xl ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:ring-emerald-900">{meta.icon}</div><div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">My profile</p><h1 className="mt-1 text-3xl font-black tracking-tight text-stone-900 dark:text-white">{user.name || 'User'}</h1><p className="mt-1 break-all text-sm text-stone-500 dark:text-stone-400">{user.email}</p><div className="mt-4 flex flex-wrap items-center gap-2"><span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-black text-stone-700 dark:bg-stone-800 dark:text-stone-200">{meta.label}</span><span className={`rounded-full px-3 py-1 text-xs font-black ${STATUS_CLASS[accountStatus] || STATUS_CLASS.ACTIVE}`}>{accountStatus}</span></div></div></div></section>
    <section className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><div className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-7"><p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Account</p><h2 className="mt-1 text-xl font-black text-stone-900 dark:text-white">Account information</h2><div className="mt-4"><InfoRow label="Full name" value={user.name || 'Not available'} /><InfoRow label="Email" value={user.email || 'Not available'} /><InfoRow label="Account type" value={meta.label} /><InfoRow label="Account status" value={accountStatus} /></div></div><div className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-7"><p className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Role</p><h2 className="mt-1 text-xl font-black text-stone-900 dark:text-white">{meta.label}</h2><p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">{meta.description}</p><RoleDetails role={role} user={user} /></div></section>
    <div className="mt-5"><NotificationSettings /></div><button type="button" onClick={handleLogout} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white py-4 text-sm font-black text-rose-600 shadow-sm transition-all hover:border-rose-300 hover:bg-rose-50 dark:border-rose-900 dark:bg-stone-900 dark:text-rose-400 dark:hover:bg-rose-950/20">Log out</button>
  </div></main>;
}
