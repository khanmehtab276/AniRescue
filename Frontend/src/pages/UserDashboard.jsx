import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, CheckCircle2, Clock3, MapPin, PawPrint, RefreshCw, Siren, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import API from '../utils/api';
import Surface from '../components/ui/Surface.jsx';
import Button from '../components/ui/Button.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { CaseListSkeleton } from '../components/ui/LoadingState.jsx';
import { StatusBadge } from '../components/ui/Badge.jsx';

const ACTIVE = ['PENDING_VALIDATION', 'PROCESSING_ANALYSIS', 'VALIDATION_PASSED', 'IN_PROGRESS', 'RESCUE_COMPLETED'];

function Stat({ label, value, Icon, tone = 'neutral' }) {
  const tones = {
    neutral: 'text-stone-900 dark:text-stone-100 bg-stone-100 dark:bg-stone-800',
    warning: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20',
    success: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20',
  };
  return (
    <Surface className="p-4">
      <div className="flex items-center justify-between gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone]}`}><Icon size={17} /></span>
        <span className="text-2xl font-black text-stone-900 dark:text-white">{value}</span>
      </div>
      <p className="mt-3 text-xs font-bold uppercase tracking-wider text-stone-400">{label}</p>
    </Surface>
  );
}

export default function UserDashboard() {
  const { user } = useAuth();
  const [cases, setCases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchCases = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const { data } = await API.get('/cases/mine');
      setCases(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.error || 'We could not load your reports.');
      setCases([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  const stats = useMemo(() => ({
    total: cases.length,
    active: cases.filter((item) => ACTIVE.includes(item.status)).length,
    resolved: cases.filter((item) => item.status === 'RESOLVED').length,
  }), [cases]);

  const current = cases.find((item) => ['IN_PROGRESS', 'RESCUE_COMPLETED'].includes(item.status))
    || cases.find((item) => item.status === 'VALIDATION_PASSED');

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-10 lg:pb-10">
      <section className="grid gap-6 lg:grid-cols-[1.45fr_.75fr]">
        <div className="relative overflow-hidden rounded-3xl bg-stone-900 p-6 text-white sm:p-8 dark:bg-stone-900">
          <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-emerald-500/20 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-emerald-300">
              <PawPrint size={17} />
              <span className="text-xs font-bold uppercase tracking-[0.16em]">Your rescue reports</span>
            </div>
            <h1 className="mt-3 max-w-xl text-3xl font-black tracking-tight sm:text-4xl">
              Hi, {user?.name?.split(' ')[0] || 'there'}.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-stone-300">
              See what is happening with every animal you have reported, from AI validation to final rescue verification.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button as={Link} to="/report" className="bg-emerald-500 hover:bg-emerald-400">
                <Siren size={16} /> Report an animal
              </Button>
              <Button as={Link} to="/map" variant="secondary" className="border-stone-700 bg-stone-800 text-white hover:bg-stone-700">
                <MapPin size={16} /> Open rescue map
              </Button>
            </div>
          </div>
        </div>

        <Surface className="p-6">
          <div className="flex items-center gap-2">
            <Sparkles size={17} className="text-emerald-600" />
            <h2 className="font-black text-stone-900 dark:text-white">Current rescue</h2>
          </div>
          {current ? (
            <div className="mt-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Case #{current.id}</p>
                  <h3 className="mt-1 text-xl font-black text-stone-900 dark:text-white">{current.species || 'Animal rescue'}</h3>
                </div>
                <StatusBadge status={current.status} friendly />
              </div>
              <p className="mt-4 line-clamp-3 text-sm leading-6 text-stone-500 dark:text-stone-400">{current.issue_description || 'Your rescue case is moving through the coordination process.'}</p>
              <Link to={`/cases/${current.id}`} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                Track this rescue <ArrowRight size={15} />
              </Link>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl bg-stone-50 p-5 dark:bg-stone-800/60">
              <p className="text-sm font-bold text-stone-800 dark:text-stone-100">Nothing needs your attention yet.</p>
              <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">Your newest report will appear here as soon as it enters the rescue workflow.</p>
            </div>
          )}
        </Surface>
      </section>

      <section className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Reports" value={stats.total} Icon={PawPrint} />
        <Stat label="Active" value={stats.active} Icon={Clock3} tone="warning" />
        <Stat label="Resolved" value={stats.resolved} Icon={CheckCircle2} tone="success" />
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">Your activity</p>
            <h2 className="mt-1 text-2xl font-black text-stone-900 dark:text-white">Reported cases</h2>
          </div>
          <button type="button" onClick={fetchCases} disabled={isLoading} className="inline-flex items-center gap-2 text-xs font-bold text-stone-500 hover:text-stone-900 disabled:opacity-50 dark:text-stone-400 dark:hover:text-white">
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {error && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

        <div className="mt-5">
          {isLoading ? <CaseListSkeleton /> : cases.length === 0 ? (
            <Surface className="p-8">
              <EmptyState icon="🐾" title="Your first report starts the rescue" message="If you see an animal that needs help, submit a report with a clear photo and location." />
              <div className="mt-5 text-center"><Button as={Link} to="/report"><Siren size={16} /> Report an animal</Button></div>
            </Surface>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
              {cases.map((item, index) => (
                <Link key={item.id} to={`/cases/${item.id}`} className="group flex flex-col gap-4 border-b border-stone-200 p-5 last:border-0 hover:bg-stone-50 sm:flex-row sm:items-center sm:justify-between dark:border-stone-800 dark:hover:bg-stone-800/60">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><PawPrint size={19} /></div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-stone-900 dark:text-white">Case #{item.id}</p>
                        <StatusBadge status={item.status} friendly compact />
                      </div>
                      <p className="mt-1 text-sm font-semibold text-stone-700 dark:text-stone-200">{item.species || 'Animal rescue report'}</p>
                      <p className="mt-1 truncate text-xs text-stone-400">{item.manual_address || item.issue_description || 'Location/details available in case'}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <span className="text-xs text-stone-400">{item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}</span>
                    <ArrowRight size={17} className="text-stone-300 transition-transform group-hover:translate-x-1 group-hover:text-emerald-600" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
