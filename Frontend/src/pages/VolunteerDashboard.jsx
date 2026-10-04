import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, CheckCircle2, Clock3, MapPin, RefreshCw, Search, Siren, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import API from '../utils/api';
import Surface from '../components/ui/Surface.jsx';
import Button from '../components/ui/Button.jsx';
import AvailabilityToggle from '../components/AvailabilityToggle.jsx';
import useVolunteerPresence from '../hooks/useVolunteerPresence.js';
import EmptyState from '../components/ui/EmptyState.jsx';
import { CaseListSkeleton } from '../components/ui/LoadingState.jsx';
import { StatusBadge, PriorityBadge } from '../components/ui/Badge.jsx';

const TABS = [
  { id: 'available', label: 'Available', Icon: Search },
  { id: 'active', label: 'Active Rescue', Icon: Activity },
  { id: 'resolved', label: 'History', Icon: CheckCircle2 },
];

function Metric({ label, value, Icon }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <Icon size={17} className="text-emerald-600 dark:text-emerald-400" />
      <p className="mt-3 text-2xl font-black text-stone-900 dark:text-white">{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-stone-400">{label}</p>
    </div>
  );
}

export default function VolunteerDashboard() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('available');
  const [cases, setCases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const presence = useVolunteerPresence();
  const volunteerId = user?.id;

  const fetchCases = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await API.get('/cases');
      setCases(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load volunteer cases:', error);
      setCases([]);
      showToast(error.response?.data?.error || 'Unable to load rescue cases.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  const availableCases = useMemo(() => cases.filter((c) => c.status === 'VALIDATION_PASSED' && !c.assigned_volunteer_id), [cases]);
  const activeCases = useMemo(() => cases.filter((c) => String(c.assigned_volunteer_id) === String(volunteerId) && ['IN_PROGRESS', 'RESCUE_COMPLETED'].includes(c.status)), [cases, volunteerId]);
  const resolvedCases = useMemo(() => cases.filter((c) => String(c.assigned_volunteer_id) === String(volunteerId) && c.status === 'RESOLVED'), [cases, volunteerId]);
  const isOnRescue = activeCases.some((c) => c.status === 'IN_PROGRESS');
  const displayed = activeTab === 'available' ? availableCases : activeTab === 'active' ? activeCases : resolvedCases;

  const handleClaim = async (caseId) => {
    setProcessingId(caseId);
    try {
      await API.put(`/cases/${caseId}/claim`);
      await fetchCases();
      setActiveTab('active');
      showToast('Rescue accepted. You can now manage the case.', 'success');
    } catch (error) {
      showToast(error.response?.data?.error || 'This case could not be claimed.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-10 lg:pb-10">
      <section className="grid gap-6 lg:grid-cols-[1.4fr_.6fr]">
        <div className="rounded-3xl bg-stone-900 p-6 text-white sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">Rescue Hub</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Ready for the next rescue?</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-stone-300">
                Keep your availability on, watch nearby eligible cases, and move an accepted rescue through to evidence submission.
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Status</p>
              <p className="mt-1 font-black text-emerald-300">{isOnRescue ? 'ON RESCUE' : presence.status || 'OFFLINE'}</p>
            </div>
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button as={Link} to="/map" variant="secondary" className="border-stone-700 bg-stone-800 text-white hover:bg-stone-700"><MapPin size={16} /> Rescue map</Button>
            {isOnRescue && <Button as={Link} to={`/cases/${activeCases.find((c) => c.status === 'IN_PROGRESS')?.id}`} className="bg-emerald-500 hover:bg-emerald-400"><Activity size={16} /> Continue active rescue</Button>}
          </div>
        </div>

        <Surface className="p-5">
          <AvailabilityToggle status={presence.status} isUpdating={presence.isUpdating} error={presence.error} onChange={presence.setAvailability} onRescue={isOnRescue} />
          {presence.lastUpdatedAt && (
            <p className="mt-2 px-1 text-[11px] font-semibold text-stone-400">Location last updated {new Date(presence.lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          )}
        </Surface>
      </section>

      <section className="mt-6 grid grid-cols-3 gap-3">
        <Metric label="Available now" value={availableCases.length} Icon={Search} />
        <Metric label="Your active" value={activeCases.length} Icon={Activity} />
        <Metric label="Completed" value={resolvedCases.length} Icon={ShieldCheck} />
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">Dispatch queue</p>
            <h2 className="mt-1 text-2xl font-black text-stone-900 dark:text-white">
              {activeTab === 'available' ? 'Cases ready to accept' : activeTab === 'active' ? 'Your active rescues' : 'Rescue history'}
            </h2>
          </div>
          <button type="button" onClick={fetchCases} disabled={isLoading} className="inline-flex items-center gap-2 text-xs font-bold text-stone-500 hover:text-stone-900 disabled:opacity-50 dark:text-stone-400 dark:hover:text-white">
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <div className="mt-5 flex gap-1 overflow-x-auto rounded-2xl border border-stone-200 bg-white p-1 dark:border-stone-800 dark:bg-stone-900">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => setActiveTab(id)} className={`inline-flex min-w-max flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black ${activeTab === id ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : 'text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800'}`}>
              <Icon size={15} /> {label}
              <span className="rounded-full bg-black/5 px-2 py-0.5 dark:bg-white/10">{id === 'available' ? availableCases.length : id === 'active' ? activeCases.length : resolvedCases.length}</span>
            </button>
          ))}
        </div>

        <div className="mt-5">
          {isLoading ? <CaseListSkeleton /> : displayed.length === 0 ? (
            <Surface className="p-8">
              <EmptyState
                icon={activeTab === 'available' ? '🦺' : activeTab === 'active' ? '🛟' : '🏁'}
                title={activeTab === 'available' ? 'No eligible rescues right now' : activeTab === 'active' ? 'No active rescue' : 'No completed rescues yet'}
                message={activeTab === 'available' ? 'Stay available. New validated cases will appear in your queue.' : activeTab === 'active' ? 'Accept a case from the available queue to start a rescue.' : 'Verified completed rescues will build your history here.'}
              />
            </Surface>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
              {displayed.map((item) => (
                <article key={item.id} className="border-b border-stone-200 p-5 last:border-0 dark:border-stone-800">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 gap-4">
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><Siren size={20} /></div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black text-stone-900 dark:text-white">Case #{item.id}</p>
                          <StatusBadge status={item.status} friendly compact />
                          <PriorityBadge priority={item.priority} />
                        </div>
                        <p className="mt-1 text-sm font-bold text-stone-700 dark:text-stone-200">{item.species || 'Animal rescue'}</p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-400">
                          {item.manual_address && <span className="inline-flex items-center gap-1"><MapPin size={12} />{item.manual_address}</span>}
                          {item.created_at && <span className="inline-flex items-center gap-1"><Clock3 size={12} />{new Date(item.created_at).toLocaleString()}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {activeTab === 'available' ? (
                        <>
                          <Button as={Link} to={`/cases/${item.id}`} variant="secondary" size="sm">View</Button>
                          <Button size="sm" disabled={processingId === item.id} onClick={() => handleClaim(item.id)}>
                            {processingId === item.id ? 'Accepting...' : 'Accept rescue'}
                          </Button>
                        </>
                      ) : (
                        <Button as={Link} to={`/cases/${item.id}`} size="sm">
                          {item.status === 'RESCUE_COMPLETED' ? 'View for verification' : 'Manage rescue'} <ArrowRight size={14} />
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
