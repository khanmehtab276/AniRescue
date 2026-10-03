import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  Building2,
  CheckCircle2,
  Crosshair,
  Save,
  MapPinned,
  ClipboardList,
  ShieldCheck,
  Siren,
  UserRound,
  Users,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import NotificationSettings from '../components/NotificationSettings.jsx';
import API from '../utils/api';
import { StatusBadge } from '../components/ui/Badge.jsx';

const ROLE_META = {
  user: { label: 'USER', icon: UserRound, accent: 'emerald', description: 'Animal reporter' },
  volunteer: { label: 'VOLUNTEER', icon: Activity, accent: 'amber', description: 'Rescue volunteer' },
  ngo: { label: 'NGO', icon: Building2, accent: 'sky', description: 'Rescue organization' },
  admin: { label: 'ADMIN', icon: ShieldCheck, accent: 'violet', description: 'Platform administrator' },
};

const STATUS_CLASS = {
  ACTIVE: 'text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:ring-emerald-900',
  PENDING: 'text-amber-700 bg-amber-50 ring-1 ring-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:ring-amber-900',
  REJECTED: 'text-rose-700 bg-rose-50 ring-1 ring-rose-200 dark:text-rose-300 dark:bg-rose-950/40 dark:ring-rose-900',
  SUSPENDED: 'text-red-700 bg-red-50 ring-1 ring-red-200 dark:text-red-300 dark:bg-red-950/40 dark:ring-red-900',
};

function InfoRow({ label, value }) {
  return (
    <div className="flex flex-col gap-1 border-b border-stone-100 py-3.5 last:border-0 dark:border-stone-800 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <span className="text-xs font-black uppercase tracking-[0.12em] text-stone-400">{label}</span>
      <span className="break-words text-sm font-bold text-stone-800 dark:text-stone-100 sm:text-right">{value || 'Not available'}</span>
    </div>
  );
}

function Section({ eyebrow, title, children }) {
  return (
    <section className="border-t border-stone-200/80 pt-7 dark:border-stone-800">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-black text-stone-900 dark:text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ActionRow({ icon: Icon, title, text, to }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-4 rounded-2xl border border-stone-200/80 bg-white/70 p-4 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50/50 dark:border-stone-800 dark:bg-stone-900/60 dark:hover:border-emerald-900 dark:hover:bg-emerald-950/20"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black text-stone-800 dark:text-stone-100">{title}</span>
        <span className="mt-0.5 block text-xs text-stone-500 dark:text-stone-400">{text}</span>
      </span>
      <span className="text-sm font-black text-emerald-600 transition-transform group-hover:translate-x-0.5">→</span>
    </Link>
  );
}

function Header({ user, role, meta }) {
  const Icon = meta.icon;
  const isNgo = role === 'ngo';
  const displayName = isNgo ? (user.organization_name || user.name || 'NGO') : (user.name || 'User');

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-8">
      <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-[1.5rem] bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
          <Icon size={32} strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-black tracking-tight text-stone-900 dark:text-white">{displayName}</h1>
            <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-black tracking-wider text-stone-700 dark:bg-stone-800 dark:text-stone-200">{meta.label}</span>
          </div>
          <p className="mt-1 break-all text-sm text-stone-500 dark:text-stone-400">{user.email}</p>
          {isNgo && user.contact_person && <p className="mt-1 text-xs font-semibold text-stone-400">Contact: {user.contact_person}</p>}
          <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-black ${STATUS_CLASS[(user.account_status || 'ACTIVE').toUpperCase()] || STATUS_CLASS.ACTIVE}`}>
            {(user.account_status || 'ACTIVE').toUpperCase()}
          </span>
        </div>
      </div>
    </section>
  );
}

function UserProfile({ user, cases }) {
  const active = cases.filter((c) => !['RESOLVED', 'REJECTED_JUNK', 'CANCELLED'].includes(c.status)).length;
  const completed = cases.filter((c) => c.status === 'RESOLVED').length;

  return (
    <>
      <Section eyebrow="Account" title="Personal information">
        <InfoRow label="Full name" value={user.name} />
        <InfoRow label="Email" value={user.email} />
        <InfoRow label="Account status" value={(user.account_status || 'ACTIVE').toUpperCase()} />
      </Section>
      <Section eyebrow="Rescue activity" title="My reports">
        <div className="grid gap-3 sm:grid-cols-2">
          <ActivityRow icon={Siren} label="Active reports" value={active} tone="rose" />
          <ActivityRow icon={CheckCircle2} label="Completed reports" value={completed} tone="emerald" />
        </div>
        <div className="mt-4"><ActionRow icon={ClipboardList} title="View my cases" text={`${cases.length} reported case(s) in your history`} to="/dashboard/cases" /></div>
      </Section>
    </>
  );
}

function VolunteerProfile({ user, cases }) {
  const assigned = cases.filter((c) => String(c.assigned_volunteer_id) === String(user.id));
  const current = assigned.find((c) => c.status === 'IN_PROGRESS');
  const completed = assigned.filter((c) => c.status === 'RESOLVED').length;
  const availability = current ? 'ON RESCUE' : (user.availability_status || 'OFFLINE').replaceAll('_', ' ');

  return (
    <>
      <Section eyebrow="Volunteer status" title="Field readiness">
        <InfoRow label="Availability" value={availability} />
        <InfoRow label="Current base" value={user.location_updated_at ? 'Current location active' : 'Location not updated'} />
        <InfoRow label="Service radius" value="Managed by rescue dispatch" />
        <InfoRow label="Transport" value="Not configured" />
      </Section>
      <Section eyebrow="Capabilities" title="Volunteer profile">
        <InfoRow label="Phone" value={user.volunteer_phone} />
        <InfoRow label="Address" value={user.volunteer_address} />
        <InfoRow label="Certifications" value="Not configured" />
      </Section>
      <Section eyebrow="Rescue activity" title="Field record">
        {current ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-900/60 dark:bg-rose-950/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs font-black uppercase tracking-wider text-rose-600">Active rescue</p><p className="mt-1 font-black dark:text-white">Case #{current.id} · In Progress</p></div>
              <StatusBadge status={current.status} friendly compact />
            </div>
            <Link to={`/cases/${current.id}`} className="mt-3 inline-flex text-xs font-black text-rose-700 dark:text-rose-300">View case details →</Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950">
            <p className="text-sm font-black dark:text-white">No active rescue</p>
            <p className="mt-1 text-xs text-stone-500">You are not currently assigned to an in-progress rescue.</p>
          </div>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><ActionRow icon={ClipboardList} title="My reports" text="Track cases reported from this account" to="/my-reports" /><ActionRow icon={CheckCircle2} title="Rescue history" text={`${completed} completed rescue(s)`} to="/volunteer/history" /></div>
      </Section>
    </>
  );
}

function NGOProfile({ user, cases }) {
  const { refreshUser } = useAuth();
  const active = cases.filter((c) => !['RESOLVED', 'REJECTED_JUNK', 'CANCELLED'].includes(c.status)).length;
  const volunteers = new Set(cases.filter((c) => c.assigned_volunteer_id).map((c) => c.assigned_volunteer_id)).size;
  const configured =
    user.jurisdiction_lat !== null &&
    user.jurisdiction_lat !== undefined &&
    user.jurisdiction_lng !== null &&
    user.jurisdiction_lng !== undefined;

  const maximumRadius = Number(user.maximum_coverage_radius_km);
  const [latitude, setLatitude] = useState(configured ? String(user.jurisdiction_lat) : '');
  const [longitude, setLongitude] = useState(configured ? String(user.jurisdiction_lng) : '');
  const [radius, setRadius] = useState(
    configured ? String(user.jurisdiction_radius_km) : String(Number.isFinite(maximumRadius) ? Math.min(15, maximumRadius) : 15),
  );
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setLatitude(configured ? String(user.jurisdiction_lat) : '');
    setLongitude(configured ? String(user.jurisdiction_lng) : '');
    setRadius(
      configured
        ? String(user.jurisdiction_radius_km)
        : String(Number.isFinite(maximumRadius) ? Math.min(15, maximumRadius) : 15),
    );
  }, [
    configured,
    user.jurisdiction_lat,
    user.jurisdiction_lng,
    user.jurisdiction_radius_km,
    maximumRadius,
  ]);

  const useCurrentLocation = () => {
    setMessage('');
    setSaveError('');

    if (!navigator.geolocation) {
      setSaveError('Your browser does not provide location access. Enter the coordinates manually.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setLocating(false);
        setMessage('Current device location loaded. Save the jurisdiction to apply it.');
      },
      (error) => {
        setLocating(false);
        setSaveError(
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. You can enter latitude and longitude manually.'
            : 'Unable to get your current location. Please try again or enter coordinates manually.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const saveJurisdiction = async (event) => {
    event.preventDefault();
    setMessage('');
    setSaveError('');

    const lat = Number(latitude);
    const lng = Number(longitude);
    const radiusKm = Number(radius);

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setSaveError('Latitude must be between -90 and 90.');
      return;
    }

    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      setSaveError('Longitude must be between -180 and 180.');
      return;
    }

    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      setSaveError('Operating radius must be greater than 0 km.');
      return;
    }

    if (Number.isFinite(maximumRadius) && radiusKm > maximumRadius) {
      setSaveError(`Operating radius cannot exceed your registered maximum of ${maximumRadius} km.`);
      return;
    }

    try {
      setSaving(true);
      const { data } = await API.put('/auth/jurisdiction', {
        lat,
        lng,
        radiusKm,
      });

      await refreshUser();
      setLatitude(String(data.user.jurisdiction_lat));
      setLongitude(String(data.user.jurisdiction_lng));
      setRadius(String(data.user.jurisdiction_radius_km));
      setMessage('NGO operating jurisdiction updated successfully.');
    } catch (error) {
      console.error('NGO jurisdiction update failed:', error);
      setSaveError(error.response?.data?.error || 'Unable to update the operating jurisdiction.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Section eyebrow="Organization info" title="Operating details">
        <InfoRow label="Operating base" value={user.organization_address} />
        <InfoRow label="Service radius" value={configured ? `${user.jurisdiction_radius_km} km` : 'Not configured'} />
        <InfoRow
          label="Maximum coverage"
          value={Number.isFinite(maximumRadius) ? `${maximumRadius} km` : 'Not available'}
        />
        <InfoRow label="Account status" value={(user.account_status || 'PENDING').toUpperCase()} />
      </Section>

      <Section eyebrow="NGO jurisdiction" title="Operating area">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/80 text-emerald-700 shadow-sm dark:bg-stone-900/70 dark:text-emerald-300">
              <MapPinned size={19} />
            </span>
            <div>
              <p className="text-sm font-black text-stone-900 dark:text-white">Choose your rescue coverage</p>
              <p className="mt-1 text-xs leading-5 text-stone-600 dark:text-stone-300">
                This center and radius control which rescue cases your NGO can access. It is separate from your device's current map location.
              </p>
            </div>
          </div>

          <form onSubmit={saveJurisdiction} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-stone-500 dark:text-stone-400">Latitude</span>
                <input
                  type="number"
                  min="-90"
                  max="90"
                  step="any"
                  value={latitude}
                  onChange={(event) => setLatitude(event.target.value)}
                  placeholder="e.g. 19.076"
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-stone-500 dark:text-stone-400">Longitude</span>
                <input
                  type="number"
                  min="-180"
                  max="180"
                  step="any"
                  value={longitude}
                  onChange={(event) => setLongitude(event.target.value)}
                  placeholder="e.g. 72.8777"
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-stone-500 dark:text-stone-400">Radius (km)</span>
                <input
                  type="number"
                  min="0.1"
                  max={Number.isFinite(maximumRadius) ? maximumRadius : undefined}
                  step="0.1"
                  value={radius}
                  onChange={(event) => setRadius(event.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                  required
                />
                {Number.isFinite(maximumRadius) && (
                  <span className="mt-1 block text-[10px] font-semibold text-stone-400">Maximum: {maximumRadius} km</span>
                )}
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={useCurrentLocation}
                disabled={locating}
                className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-xs font-black text-stone-700 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:text-emerald-700 disabled:cursor-wait disabled:opacity-60 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-emerald-800 dark:hover:text-emerald-300"
              >
                <Crosshair size={15} className={locating ? 'animate-spin' : ''} />
                {locating ? 'Detecting location...' : 'Use my current location'}
              </button>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
              >
                <Save size={15} />
                {saving ? 'Saving...' : 'Save jurisdiction'}
              </button>
            </div>

            {message && <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{message}</p>}
            {saveError && <p className="text-xs font-bold text-rose-600 dark:text-rose-300">{saveError}</p>}
          </form>
        </div>
      </Section>

      <Section eyebrow="Organization" title="Contact information">
        <InfoRow label="Organization" value={user.organization_name} />
        <InfoRow label="Contact person" value={user.contact_person} />
        <InfoRow label="Phone" value={user.organization_phone} />
      </Section>

      <Section eyebrow="Operations" title="Rescue network">
        <div className="grid gap-3 sm:grid-cols-2">
          <ActivityRow icon={Siren} label="Active cases" value={active} tone="rose" />
          <ActivityRow icon={Users} label="Volunteers on cases" value={volunteers} tone="sky" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ActionRow icon={ClipboardList} title="My reports" text="Track cases reported from this account" to="/my-reports" />
          <ActionRow icon={ClipboardList} title="View operations" text="Open your jurisdiction-scoped case feed" to="/ngo/cases" />
          <ActionRow icon={Users} title="View volunteers" text="Coordinate available rescue volunteers" to="/ngo/volunteers" />
        </div>
      </Section>
    </>
  );
}
function AdminProfile({ user, cases }) {
  const active = cases.filter((c) => !['RESOLVED', 'REJECTED_JUNK', 'CANCELLED'].includes(c.status)).length;
  const verification = cases.filter((c) => c.status === 'RESCUE_COMPLETED').length;

  return (
    <>
      <Section eyebrow="System controls" title="Account & access">
        <InfoRow label="Account status" value={(user.account_status || 'ACTIVE').toUpperCase()} />
        <InfoRow label="Access level" value="Global Administrator" />
        <InfoRow label="Case audit trail" value="Available from individual case history" />
      </Section>
      <Section eyebrow="Global operations" title="Platform activity">
        <div className="grid gap-3 sm:grid-cols-3">
          <ActivityRow icon={Siren} label="Live cases" value={active} tone="rose" />
          <ActivityRow icon={ClipboardList} label="Verification queue" value={verification} tone="amber" />
          <ActivityRow icon={Users} label="Case assignments" value={cases.filter((c) => c.assigned_volunteer_id).length} tone="sky" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ActionRow icon={ClipboardList} title="My reports" text="Track cases reported from this account" to="/my-reports" />
          <ActionRow icon={ClipboardList} title="Open case management" text="Manage the global rescue case list" to="/admin/cases" />
          <ActionRow icon={ShieldCheck} title="Review verification" text="Handle cases awaiting verification" to="/verification" />
        </div>
      </Section>
    </>
  );
}

function ActivityRow({ icon: Icon, label, value, tone = 'emerald' }) {
  const tones = {
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-300',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-300',
    sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950/20 dark:text-sky-300',
  };
  return (
    <div className={`flex items-center gap-3 rounded-2xl px-4 py-4 ${tones[tone] || tones.emerald}`}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/70 dark:bg-stone-900/50"><Icon size={17} /></span>
      <div><p className="text-xs font-black uppercase tracking-wider opacity-70">{label}</p><p className="mt-1 text-2xl font-black text-stone-900 dark:text-white">{value}</p></div>
    </div>
  );
}

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  const role = (user?.role || 'user').toLowerCase();
  const meta = ROLE_META[role] || ROLE_META.user;

  const loadCases = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const endpoint = role === 'user' ? '/cases/mine' : '/cases';
      const { data } = await API.get(endpoint);
      setCases(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Profile case activity load failed:', error);
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, [role, user]);

  useEffect(() => { loadCases(); }, [loadCases]);

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };
  const content = role === 'ngo'
    ? <NGOProfile user={user} cases={cases} />
    : role === 'volunteer'
      ? <VolunteerProfile user={user} cases={cases} />
      : role === 'admin'
        ? <AdminProfile user={user} cases={cases} />
        : <UserProfile user={user} cases={cases} />;

  return (
    <main className="min-h-[75vh] px-4 pb-24 sm:px-6 lg:px-8 lg:pb-10">
      <div className="mx-auto max-w-5xl py-6 lg:py-10">
        <Header user={user} role={role} meta={meta} />
        <div className="mt-8 space-y-8">
          {loading ? (
            <div className="border-t border-stone-200 pt-7 dark:border-stone-800"><p className="text-sm text-stone-500">Loading profile activity...</p></div>
          ) : content}
        </div>
        <div className="mt-8 border-t border-stone-200 pt-7 dark:border-stone-800">
          <NotificationSettings />
        </div>
        <button type="button" onClick={handleLogout} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white py-4 text-sm font-black text-rose-600 shadow-sm transition-all hover:border-rose-300 hover:bg-rose-50 dark:border-rose-900 dark:bg-stone-900 dark:text-rose-400 dark:hover:bg-rose-950/20">Log out</button>
      </div>
    </main>
  );
}