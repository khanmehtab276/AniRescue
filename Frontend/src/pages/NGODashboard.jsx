import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import API from '../utils/api';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import useLocation from '../hooks/useLocation.js';
import Surface from '../components/ui/Surface.jsx';
import Button from '../components/ui/Button.jsx';
import { AlertTriangle, Siren, Bot } from 'lucide-react';
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
  const [dispatchModal, setDispatchModal] = useState({ open: false, caseId: null, volunteers: [] });

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

  const openDispatcher = async (caseId) => {
    try {
      const { data } = await API.get(`/cases/${caseId}/nearby-volunteers`);
      setDispatchModal({ open: true, caseId, volunteers: Array.isArray(data.volunteers) ? data.volunteers : [] });
    } catch (error) {
      showToast(error.response?.data?.error || 'Unable to find nearby volunteers.', 'error');
    }
  };

  const activeCases = cases.filter(
    (c) => !['RESOLVED', 'REJECTED_JUNK', 'CANCELLED'].includes(c.status),
  );

  const inProgressCases = cases.filter((c) => c.status === 'IN_PROGRESS');

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto mb-20 md:mb-0">

      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            NGO Operations
          </p>
          <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">
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
          <p className="font-extrabold text-slate-800 dark:text-slate-100 mb-1">
            Set your operating area
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Your case feed only shows cases within your service radius. Set this once so cases start appearing below.
          </p>

          <div className="flex items-center gap-3 mb-4">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">
              Radius (km)
            </label>
            <input
              type="number"
              min={1}
              max={200}
              value={radiusKm}
              onChange={(e) => setRadiusKm(e.target.value)}
              className="w-24 p-2 rounded-lg text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
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
        <div className="flex gap-1">
          <button
            onClick={() => setActiveSection('operations')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeSection === 'operations'
                ? 'bg-[#1a1f2e] dark:bg-black text-white'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            🚨 Operations
          </button>
          <button
            onClick={() => setActiveSection('ai')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeSection === 'ai'
                ? 'bg-[#1a1f2e] dark:bg-black text-white'
                : 'text-slate-500 dark:text-slate-400'
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
            <div className="space-y-4">
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
            <div className="space-y-4">
              {junkQueue.map((caseItem) => (
                <Surface key={caseItem.id} className="p-5">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Case #{caseItem.id}
                      </p>
                      <h3 className="mt-1 font-extrabold text-slate-800 dark:text-slate-100">
                        {caseItem.species || 'Animal Case'}
                      </h3>
                    </div>
                    <span className="text-2xl">⚠️</span>
                  </div>

                  <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
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
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <Surface className="max-h-[85vh] w-full max-w-lg overflow-y-auto p-5 sm:rounded-2xl">

            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
                  Nearby Volunteers
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Within 5 km of Case #{dispatchModal.caseId}
                </p>
              </div>

              <button
                onClick={() => setDispatchModal({ open: false, caseId: null, volunteers: [] })}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500"
              >
                ✕
              </button>
            </div>

            {dispatchModal.volunteers.length === 0 ? (
              <EmptyState icon="🦺" title="No nearby volunteers" message="No volunteers were found within the 5 km radius." />
            ) : (
              <div className="space-y-3">
                {dispatchModal.volunteers.map((volunteer) => (
                  <div
                    key={volunteer.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-slate-100 dark:bg-slate-800 p-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-xl">
                        🦺
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-extrabold text-slate-800 dark:text-slate-100">
                          {volunteer.full_name || 'Volunteer'}
                        </p>
                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {Number(volunteer.distance_km || 0).toFixed(2)} km away
                        </p>
                      </div>
                    </div>

                    {/*
                     * No backend "dispatch" endpoint exists — this is
                     * intentionally not a fake dispatch button.
                     */}
                    <span className="rounded-full bg-slate-500/10 px-3 py-1.5 text-[10px] font-black text-slate-500 dark:text-slate-400">
                      AVAILABLE
                    </span>
                  </div>
                ))}
              </div>
            )}

            <Button
              variant="secondary"
              className="mt-5 w-full"
              onClick={() => setDispatchModal({ open: false, caseId: null, volunteers: [] })}
            >
              Close
            </Button>
          </Surface>
        </div>
      )}

    </div>
  );
}
