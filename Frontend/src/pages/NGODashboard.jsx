import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import API from '../utils/api';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import useLocation from '../hooks/useLocation.js';
import Surface from '../components/ui/Surface.jsx';
import Button from '../components/ui/Button.jsx';
import { AlertTriangle, Siren, Bot, X, HardHat } from 'lucide-react';
import BentoStats from '../components/ui/BentoStats.jsx';
import CaseCard from '../components/ui/CaseCard.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { CaseListSkeleton } from '../components/ui/LoadingState.jsx';

export default function NGODashboard() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();

  const [cases, setCases] = useState([]);
  const [junkQueue, setJunkQueue] = useState([]);
  const [pendingVerificationCount, setPendingVerificationCount] = useState(0);
  const [dispatchModal, setDispatchModal] = useState({ open: false, caseId: null, volunteers: [], radiusKm: null });
  const [assigningId, setAssigningId] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isJunkLoading, setIsJunkLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('operations');

  const [radiusKm, setRadiusKm] = useState(15);
  const [isSavingJurisdiction, setIsSavingJurisdiction] = useState(false);
  const { location: detectedLocation, getLocation, isLoading: isLocating } = useLocation();

  const hasJurisdiction =
    user?.jurisdiction_lat !== null && user?.jurisdiction_lat !== undefined;

  const fetchCases = useCallback(async () => {
    setIsLoading(true);

    try {
      const { data } = await API.get('/cases');
      setCases(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load NGO cases:', error);
      setCases([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchJunkQueue = useCallback(async () => {
    setIsJunkLoading(true);

    try {
      const { data } = await API.get('/cases/admin/junk');
      setJunkQueue(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load AI junk queue:', error);
      setJunkQueue([]);
    } finally {
      setIsJunkLoading(false);
    }
  }, []);

  const fetchVerificationCount = useCallback(async () => {
    try {
      const { data } = await API.get('/cases/verification-queue');
      setPendingVerificationCount(Array.isArray(data) ? data.length : 0);
    } catch (error) {
      console.error('Failed to load verification queue count:', error);
    }
  }, []);

  useEffect(() => {
    if (!hasJurisdiction) {
      getLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasJurisdiction]);

  useEffect(() => {
    fetchCases();
    fetchJunkQueue();
    fetchVerificationCount();
  }, [fetchCases, fetchJunkQueue, fetchVerificationCount]);

  const handleSaveJurisdiction = async () => {
    if (!detectedLocation) {
      showToast('Detecting your location — click again once it\'s found, or check location permissions.', 'warning');
      getLocation();
      return;
    }

    setIsSavingJurisdiction(true);

    try {
      await API.put('/auth/jurisdiction', {
        lat: detectedLocation.lat,
        lng: detectedLocation.lng,
        radiusKm: Number(radiusKm),
      });

      showToast('Operating area saved. Your case feed will now reflect it.', 'success');
      await refreshUser?.();
      await fetchCases();
    } catch (error) {
      showToast(error.response?.data?.error || 'Failed to save operating area.', 'error');
    } finally {
      setIsSavingJurisdiction(false);
    }
  };

  const overrideJunk = async (id) => {
    try {
      await API.put(`/cases/${id}/verify-junk`, { approved: true });
      setJunkQueue((prev) => prev.filter((item) => item.id !== id));
      showToast('Case marked as valid and returned to the active queue.', 'success');
      await fetchCases();
    } catch (error) {
      showToast(error.response?.data?.error || 'Failed to override this case.', 'error');
    }
  };

  const closeDispatcher = () =>
    setDispatchModal({ open: false, caseId: null, volunteers: [], radiusKm: null });

  const openDispatcher = async (caseId) => {
    try {
      const { data } = await API.get(`/cases/${caseId}/nearby-volunteers`);
      setDispatchModal({
        open: true,
        caseId,
        volunteers: Array.isArray(data.volunteers) ? data.volunteers : [],
        radiusKm: data.searchRadiusKm ?? null,
      });
    } catch (error) {
      showToast(error.response?.data?.error || 'Unable to find nearby volunteers.', 'error');
    }
  };

  const handleAssignVolunteer = async (volunteer) => {
    setAssigningId(volunteer.id);

    try {
      await API.put(`/cases/${dispatchModal.caseId}/assign`, { volunteerId: volunteer.id });
      showToast(`${volunteer.full_name || 'Volunteer'} assigned. They have been notified.`, 'success');
      closeDispatcher();
      await fetchCases();
    } catch (error) {
      showToast(error.response?.data?.error || 'Failed to assign volunteer.', 'error');
    } finally {
      setAssigningId(null);
    }
  };

  useEffect(() => {
    if (!dispatchModal.open) return undefined;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeDispatcher();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dispatchModal.open]);

  const activeCases = cases.filter(
    (c) => !['RESOLVED', 'REJECTED_JUNK', 'CANCELLED'].includes(c.status),
  );

  const inProgressCases = cases.filter((c) => c.status === 'IN_PROGRESS');

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-10 lg:pb-10">

      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            NGO Operations
          </p>
          <h1 className="text-2xl font-extrabold text-stone-800 dark:text-stone-100">
            Command Center
          </h1>
        </div>

        {pendingVerificationCount > 0 && (
          <Button as={Link} to="/verification" size="sm" variant="secondary">
            📋 {pendingVerificationCount} to verify
          </Button>
        )}
      </div>

      {/* JURISDICTION SETUP — required for the case feed to return anything */}
      {!hasJurisdiction && (
        <Surface className="p-5 mb-6">
          <p className="font-extrabold text-stone-800 dark:text-stone-100 mb-1">
            Set your operating area
          </p>
          <p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
            Your case feed only shows cases within your service radius. Set this once so cases start appearing below.
          </p>

          <div className="flex items-center gap-3 mb-4">
            <label className="text-xs font-bold text-stone-500 dark:text-stone-400 shrink-0">
              Radius (km)
            </label>
            <input
              type="number"
              min={1}
              max={200}
              value={radiusKm}
              onChange={(e) => setRadiusKm(e.target.value)}
              className="w-24 p-2 rounded-lg text-sm bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200"
            />
          </div>

          <Button onClick={handleSaveJurisdiction} disabled={isSavingJurisdiction || isLocating} className="w-full">
            {isLocating ? 'Detecting location...' : detectedLocation ? 'Save Operating Area (uses current location)' : 'Detect My Location'}
          </Button>
        </Surface>
      )}

      {/* STATS */}
      <div className="mb-6">
        <BentoStats
          items={[
            { label: 'Active Cases', value: activeCases.length, tone: 'danger', Icon: AlertTriangle },
            { label: 'Rescue', value: inProgressCases.length, tone: 'warning', Icon: Siren },
            { label: 'AI Review', value: junkQueue.length, tone: 'info', Icon: Bot },
          ]}
        />
      </div>

      {/* SECTION SWITCHER */}
      <Surface className="p-2 mb-6">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setActiveSection('operations')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeSection === 'operations'
                ? 'bg-stone-900 dark:bg-stone-100 dark:text-stone-900 text-white'
                : 'text-stone-500 dark:text-stone-400'
            }`}
          >
            🚨 Operations
          </button>
          <button
            onClick={() => setActiveSection('ai')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeSection === 'ai'
                ? 'bg-[#1a1f2e] dark:bg-black text-white'
                : 'text-stone-500 dark:text-stone-400'
            }`}
          >
            🤖 AI Review
          </button>
        </div>
      </Surface>

      {activeSection === 'operations' && (
        <section>
          {isLoading ? (
            <CaseListSkeleton />
          ) : activeCases.length === 0 ? (
            <EmptyState
              icon="🐾"
              title="No active cases"
              message={
                hasJurisdiction
                  ? 'No active cases within your operating area right now.'
                  : 'Set your operating area above to start seeing cases here.'
              }
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
              {activeCases.map((caseItem) => (
                <CaseCard
                  key={caseItem.id}
                  caseItem={caseItem}
                  action={
                    caseItem.status === 'VALIDATION_PASSED' ? (
                      <Button size="sm" className="w-full" onClick={() => openDispatcher(caseItem.id)}>
                        🦺 Find Nearby Volunteers
                      </Button>
                    ) : (
                      <Link
                        to={`/cases/${caseItem.id}`}
                        className="text-xs font-bold text-emerald-600 dark:text-emerald-400"
                      >
                        View Details →
                      </Link>
                    )
                  }
                />
              ))}
            </div>
          )}
        </section>
      )}

      {activeSection === 'ai' && (
        <section>
          {isJunkLoading ? (
            <CaseListSkeleton />
          ) : junkQueue.length === 0 ? (
            <EmptyState icon="✅" title="Review queue is clear" message="No AI-flagged cases require review." />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {junkQueue.map((caseItem) => (
                <Surface key={caseItem.id} className="p-5">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">
                        Case #{caseItem.id}
                      </p>
                      <h3 className="mt-1 font-extrabold text-stone-800 dark:text-stone-100">
                        {caseItem.species || 'Animal Case'}
                      </h3>
                    </div>
                    <span className="text-2xl">⚠️</span>
                  </div>

                  <p className="mb-4 text-sm text-stone-600 dark:text-stone-300">
                    {caseItem.issue_description || 'No description available.'}
                  </p>

                  <Button className="w-full" onClick={() => overrideJunk(caseItem.id)}>
                    ✓ Override — Mark as Valid
                  </Button>
                </Surface>
              ))}
            </div>
          )}
        </section>
      )}

      {/* NEARBY VOLUNTEER DISPATCH MODAL */}
      {dispatchModal.open && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={closeDispatcher}
        >
          <Surface
            role="dialog"
            aria-modal="true"
            aria-labelledby="dispatch-modal-title"
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto p-5 sm:rounded-2xl animate-rescue-fade-up"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 id="dispatch-modal-title" className="text-lg font-extrabold text-stone-800 dark:text-stone-100">
                  Nearby Volunteers
                </h3>
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                  {dispatchModal.radiusKm
                    ? `Within ${dispatchModal.radiusKm} km of Case #${dispatchModal.caseId}, from your volunteer roster`
                    : `Case #${dispatchModal.caseId}`}
                </p>
              </div>

              <button
                onClick={closeDispatcher}
                aria-label="Close nearby volunteers dialog"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-200 dark:bg-stone-800 text-stone-500"
              >
                <X size={18} strokeWidth={2.5} aria-hidden="true" />
              </button>
            </div>

            {dispatchModal.volunteers.length === 0 ? (
              <EmptyState
                icon="🦺"
                title="No one available right now"
                message="No volunteers on your roster are both available and within range. Add volunteers to your roster, or check back shortly."
              />
            ) : (
              <div className="space-y-3 rescue-stagger">
                {dispatchModal.volunteers.map((volunteer) => (
                  <div
                    key={volunteer.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-stone-100 dark:bg-stone-800 p-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <HardHat size={20} strokeWidth={2} aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-extrabold text-stone-800 dark:text-stone-100">
                          {volunteer.full_name || 'Volunteer'}
                        </p>
                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {Number(volunteer.distance_km || 0).toFixed(2)} km away
                        </p>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      disabled={assigningId === volunteer.id}
                      onClick={() => handleAssignVolunteer(volunteer)}
                    >
                      {assigningId === volunteer.id ? 'Assigning...' : 'Assign'}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Button
              variant="secondary"
              className="mt-5 w-full"
              onClick={closeDispatcher}
            >
              Close
            </Button>
          </Surface>
        </div>
      )}

    </div>
  );
}
