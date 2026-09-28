import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import API from '../utils/api';
import Surface from '../components/ui/Surface.jsx';
import Button from '../components/ui/Button.jsx';
import CaseCard from '../components/ui/CaseCard.jsx';
import AvailabilityToggle from '../components/AvailabilityToggle.jsx';
import useVolunteerPresence from '../hooks/useVolunteerPresence.js';
import EmptyState from '../components/ui/EmptyState.jsx';
import { CaseListSkeleton } from '../components/ui/LoadingState.jsx';

const TABS = [
  { id: 'available', label: 'Available' },
  { id: 'active', label: 'Active' },
  { id: 'resolved', label: 'Resolved' },
];

export default function VolunteerDashboard() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState('available');
  const [cases, setCases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  const volunteerId = user?.id;

  const presence = useVolunteerPresence();

  // Single role-aware fetch: the backend now returns this volunteer's
  // assignments (any status) PLUS eligible-to-claim cases in one call.
  const fetchCases = useCallback(async () => {
    setIsLoading(true);

    try {
      const { data } = await API.get('/cases');
      setCases(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load volunteer cases:', error);
      setCases([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const handleClaimCase = async (caseId) => {
    if (!caseId || processingId === caseId) return;

    setProcessingId(caseId);

    try {
      await API.put(`/cases/${caseId}/claim`);
      await fetchCases();
      setActiveTab('active');
      showToast('Case claimed. It now appears under Active.', 'success');
    } catch (error) {
      console.error('Failed to claim case:', error);

      const message =
        error.response?.data?.error ||
        'Failed to claim this rescue case. It may already have been claimed by another volunteer.';

      showToast(message, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const availableCases = cases.filter(
    (c) => c.status === 'VALIDATION_PASSED' && !c.assigned_volunteer_id,
  );

  const activeCases = cases.filter(
    (c) =>
      String(c.assigned_volunteer_id) === String(volunteerId) &&
      ['IN_PROGRESS', 'RESCUE_COMPLETED'].includes(c.status),
  );

  const resolvedCases = cases.filter(
    (c) =>
      String(c.assigned_volunteer_id) === String(volunteerId) &&
      c.status === 'RESOLVED',
  );

  const displayedCases =
    activeTab === 'available'
      ? availableCases
      : activeTab === 'active'
        ? activeCases
        : resolvedCases;

  const isOnRescue = cases.some(
    (c) =>
      String(c.assigned_volunteer_id) === String(volunteerId) &&
      c.status === 'IN_PROGRESS',
  );

  const tabCounts = {
    available: availableCases.length,
    active: activeCases.length,
    resolved: resolvedCases.length,
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto mb-20 md:mb-0">

      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Volunteer Hub
          </p>
          <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">
            Which rescue needs you now?
          </h1>
        </div>

        <button
          type="button"
          onClick={fetchCases}
          disabled={isLoading}
          className="text-xs font-bold text-blue-600 dark:text-blue-400 disabled:opacity-50 shrink-0"
        >
          Refresh
        </button>
      </div>

      <AvailabilityToggle
        status={presence.status}
        isUpdating={presence.isUpdating}
        error={presence.error}
        onChange={presence.setAvailability}
        onRescue={isOnRescue}
      />

      <Surface className="p-2 mb-6">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all duration-300 ${
                activeTab === tab.id
                  ? 'bg-[#1a1f2e] dark:bg-black text-white'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {tab.label} ({tabCounts[tab.id]})
            </button>
          ))}
        </div>
      </Surface>

      {isLoading ? (
        <CaseListSkeleton />
      ) : displayedCases.length === 0 ? (
        <EmptyState
          icon={activeTab === 'resolved' ? '🎉' : '🦺'}
          title={
            activeTab === 'available'
              ? 'No cases available right now'
              : activeTab === 'active'
                ? 'Nothing active'
                : 'No completed rescues yet'
          }
          message={
            activeTab === 'available'
              ? 'No rescue cases are currently available in your queue.'
              : activeTab === 'active'
                ? 'Claim a case from Available to see it here.'
                : 'Rescues you complete and get verified will show up here.'
          }
        />
      ) : (
        <div className="space-y-4">
          {displayedCases.map((caseItem) => (
            <CaseCard
              key={caseItem.id}
              caseItem={caseItem}
              action={
                activeTab === 'available' ? (
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={processingId === caseItem.id}
                    onClick={() => handleClaimCase(caseItem.id)}
                  >
                    {processingId === caseItem.id ? 'Claiming...' : 'Accept Case'}
                  </Button>
                ) : activeTab === 'active' ? (
                  <Button as={Link} to={`/cases/${caseItem.id}`} size="sm" className="w-full">
                    {caseItem.status === 'RESCUE_COMPLETED'
                      ? 'View — Awaiting Verification'
                      : 'Manage Rescue →'}
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

    </div>
  );
}
