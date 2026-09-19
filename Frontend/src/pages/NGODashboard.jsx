import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../utils/api';
import { useToast } from '../contexts/ToastContext.jsx';

export default function NGODashboard() {
  const { showToast } = useToast();

  const [cases, setCases] = useState([]);
  const [junkQueue, setJunkQueue] = useState([]);
  const [dispatchModal, setDispatchModal] = useState({
    open: false,
    caseId: null,
    volunteers: [],
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isJunkLoading, setIsJunkLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('operations');

  // --------------------------------------------------
  // LOAD ACTIVE CASES
  // --------------------------------------------------
  useEffect(() => {
    const fetchCases = async () => {
      try {
        const response = await API.get('/cases');

        const data = Array.isArray(response.data)
          ? response.data
          : [];

        setCases(data);
      } catch (error) {
        console.error('Failed to load admin cases:', error);
        setCases([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCases();
  }, []);

  // --------------------------------------------------
  // LOAD AI JUNK REVIEW QUEUE
  // --------------------------------------------------
  useEffect(() => {
    const fetchJunkQueue = async () => {
      try {
        /*
         * Current backend route:
         * GET /api/cases/admin/junk
         */
        const response = await API.get('/cases/admin/junk');

        const data = Array.isArray(response.data)
          ? response.data
          : [];

        setJunkQueue(data);
      } catch (error) {
        console.error('Failed to load AI junk queue:', error);
        setJunkQueue([]);
      } finally {
        setIsJunkLoading(false);
      }
    };

    fetchJunkQueue();
  }, []);

  // --------------------------------------------------
  // REFRESH CASES
  // --------------------------------------------------
  const refreshCases = async () => {
    try {
      const response = await API.get('/cases');

      const data = Array.isArray(response.data)
        ? response.data
        : [];

      setCases(data);
    } catch (error) {
      console.error('Failed to refresh cases:', error);
    }
  };

  // --------------------------------------------------
  // OVERRIDE AI JUNK DECISION
  // --------------------------------------------------
  const overrideJunk = async (id) => {
    try {
      await API.put(`/cases/${id}/verify-junk`, { approved: true });

      setJunkQueue((previous) =>
        previous.filter((item) => item.id !== id)
      );

      showToast('Case marked as valid and returned to the active queue.', 'success');

      await refreshCases();
    } catch (error) {
      console.error('Failed to override junk case:', error);

      showToast(
        error.response?.data?.error ||
        'Failed to override this case.',
        'error'
      );
    }
  };

  // --------------------------------------------------
  // FIND NEARBY VOLUNTEERS
  // --------------------------------------------------
  const openDispatcher = async (caseId) => {
    try {
      const response = await API.get(
        `/cases/${caseId}/nearby-volunteers`
      );

      const volunteers = Array.isArray(response.data)
        ? response.data
        : [];

      setDispatchModal({
        open: true,
        caseId,
        volunteers,
      });
    } catch (error) {
      console.error('Failed to find nearby volunteers:', error);

      showToast(
        error.response?.data?.error ||
        'Unable to find nearby volunteers.',
        'error'
      );
    }
  };

  // --------------------------------------------------
  // CASE FILTERING
  // --------------------------------------------------
  const activeCases = cases.filter(
    (item) =>
      item.status !== 'RESOLVED' &&
      item.status !== 'REJECTED_JUNK' &&
      item.status !== 'CANCELLED'
  );

  const inProgressCases = cases.filter(
    (item) => item.status === 'IN_PROGRESS'
  );

  // --------------------------------------------------
  // STATUS UI
  // --------------------------------------------------
  const getStatusStyle = (status) => {
    switch (status) {
      case 'VALIDATION_PASSED':
        return {
          label: 'Validated',
          className:
            'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        };

      case 'IN_PROGRESS':
        return {
          label: 'In Progress',
          className:
            'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        };

      case 'PENDING_VALIDATION':
        return {
          label: 'AI Validation',
          className:
            'bg-blue-500/10 text-blue-600 dark:text-blue-400',
        };

      case 'RESOLVED':
        return {
          label: 'Resolved',
          className:
            'bg-green-500/10 text-green-600 dark:text-green-400',
        };

      case 'REJECTED_JUNK':
        return {
          label: 'Rejected',
          className:
            'bg-rose-500/10 text-rose-600 dark:text-rose-400',
        };

      case 'CANCELLED':
        return {
          label: 'Cancelled',
          className:
            'bg-gray-500/10 text-gray-600 dark:text-gray-400',
        };

      default:
        return {
          label: status || 'Pending',
          className:
            'bg-gray-500/10 text-gray-600 dark:text-gray-400',
        };
    }
  };

  return (
    <div className="min-h-[80vh] px-4 pb-24 pt-2 md:px-6 lg:px-8">

      {/* ==================================================
          HEADER
      ================================================== */}
      <div className="mx-auto max-w-2xl">

        <div className="mb-6">
          <div className="flex items-center justify-between gap-3">

            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🏢</span>

                <h1 className="text-2xl font-extrabold text-gray-800 dark:text-gray-100">
                  Command Center
                </h1>
              </div>

              <p className="mt-1 text-sm font-medium text-gray-500 dark:text-gray-400">
                Admin & NGO Operations
              </p>
            </div>

            <Link
              to="/map"
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#e2e8f0] text-xl shadow-[5px_5px_10px_#cbd5e1,-5px_-5px_10px_#f8fafc] transition-transform active:scale-95 dark:bg-[#0f172a] dark:shadow-[5px_5px_10px_#070a13,-5px_-5px_10px_#172441]"
              title="Open Map"
            >
              🗺️
            </Link>

          </div>
        </div>

        {/* ==================================================
            QUICK STAT CARDS
        ================================================== */}

        <div className="mb-6 grid grid-cols-3 gap-3">

          <div className="rounded-2xl bg-[#e2e8f0] p-4 text-center shadow-[5px_5px_10px_#cbd5e1,-5px_-5px_10px_#f8fafc] dark:bg-[#0f172a] dark:shadow-[5px_5px_10px_#070a13,-5px_-5px_10px_#172441]">
            <p className="text-2xl font-black text-rose-500">
              {activeCases.length}
            </p>

            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Active
            </p>
          </div>

          <div className="rounded-2xl bg-[#e2e8f0] p-4 text-center shadow-[5px_5px_10px_#cbd5e1,-5px_-5px_10px_#f8fafc] dark:bg-[#0f172a] dark:shadow-[5px_5px_10px_#070a13,-5px_-5px_10px_#172441]">
            <p className="text-2xl font-black text-amber-500">
              {inProgressCases.length}
            </p>

            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Rescue
            </p>
          </div>

          <div className="rounded-2xl bg-[#e2e8f0] p-4 text-center shadow-[5px_5px_10px_#cbd5e1,-5px_-5px_10px_#f8fafc] dark:bg-[#0f172a] dark:shadow-[5px_5px_10px_#070a13,-5px_-5px_10px_#172441]">
            <p className="text-2xl font-black text-purple-500">
              {junkQueue.length}
            </p>

            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              AI Review
            </p>
          </div>

        </div>

        {/* ==================================================
            MOBILE SECTION SWITCHER
        ================================================== */}

        <div className="mb-6 flex rounded-2xl bg-[#e2e8f0] p-1.5 shadow-[inset_3px_3px_6px_#cbd5e1,inset_-3px_-3px_6px_#f8fafc] dark:bg-[#0f172a] dark:shadow-[inset_3px_3px_6px_#070a13,inset_-3px_-3px_6px_#172441]">

          <button
            onClick={() => setActiveSection('operations')}
            className={`flex-1 rounded-xl px-3 py-3 text-xs font-extrabold transition-all ${
              activeSection === 'operations'
                ? 'bg-emerald-500 text-white shadow-md'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            🚨 Operations
          </button>

          <button
            onClick={() => setActiveSection('ai')}
            className={`flex-1 rounded-xl px-3 py-3 text-xs font-extrabold transition-all ${
              activeSection === 'ai'
                ? 'bg-purple-500 text-white shadow-md'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            🤖 AI Review
          </button>

        </div>

        {/* ==================================================
            OPERATIONS
        ================================================== */}

        {activeSection === 'operations' && (
          <section>

            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-gray-800 dark:text-gray-100">
                  Active Rescue Queue
                </h2>

                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Live rescue cases
                </p>
              </div>

              <button
                onClick={refreshCases}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e2e8f0] text-lg shadow-[4px_4px_8px_#cbd5e1,-4px_-4px_8px_#f8fafc] transition-transform active:scale-90 dark:bg-[#0f172a] dark:shadow-[4px_4px_8px_#070a13,-4px_-4px_8px_#172441]"
                title="Refresh"
              >
                🔄
              </button>
            </div>

            {isLoading ? (
              <div className="rounded-3xl bg-[#e2e8f0] p-10 text-center shadow-[8px_8px_16px_#cbd5e1,-8px_-8px_16px_#f8fafc] dark:bg-[#0f172a] dark:shadow-[8px_8px_16px_#070a13,-8px_-8px_16px_#172441]">
                <div className="mb-3 text-3xl animate-pulse">
                  📡
                </div>

                <p className="text-sm font-bold text-gray-500 dark:text-gray-400">
                  Syncing rescue database...
                </p>
              </div>
            ) : activeCases.length === 0 ? (
              <div className="rounded-3xl bg-[#e2e8f0] p-10 text-center shadow-[8px_8px_16px_#cbd5e1,-8px_-8px_16px_#f8fafc] dark:bg-[#0f172a] dark:shadow-[8px_8px_16px_#070a13,-8px_-8px_16px_#172441]">
                <div className="mb-3 text-4xl">
                  🐾
                </div>

                <p className="font-extrabold text-gray-700 dark:text-gray-200">
                  No active cases
                </p>

                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  The rescue queue is currently clear.
                </p>
              </div>
            ) : (
              <div className="space-y-4">

                {activeCases.map((caseItem) => {
                  const status = getStatusStyle(caseItem.status);

                  return (
                    <div
                      key={caseItem.id}
                      className="rounded-3xl bg-[#e2e8f0] p-5 shadow-[8px_8px_16px_#cbd5e1,-8px_-8px_16px_#f8fafc] dark:bg-[#0f172a] dark:shadow-[8px_8px_16px_#070a13,-8px_-8px_16px_#172441]"
                    >

                      {/* Case Header */}
                      <div className="mb-4 flex items-start justify-between gap-3">

                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                            Case #{caseItem.id}
                          </p>

                          <h3 className="mt-1 text-lg font-extrabold text-gray-800 dark:text-gray-100">
                            {caseItem.species || 'Unknown Animal'}
                          </h3>
                        </div>

                        <span
                          className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${status.className}`}
                        >
                          {status.label}
                        </span>

                      </div>

                      {/* Description */}
                      <div className="mb-4 rounded-2xl bg-[#e2e8f0] p-4 shadow-[inset_3px_3px_6px_#cbd5e1,inset_-3px_-3px_6px_#f8fafc] dark:bg-[#0f172a] dark:shadow-[inset_3px_3px_6px_#070a13,inset_-3px_-3px_6px_#172441]">

                        <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                          {caseItem.issue_description ||
                            'No description provided.'}
                        </p>

                      </div>

                      {/* Location */}
                      <div className="mb-4 flex items-start gap-3">

                        <span className="text-lg">
                          📍
                        </span>

                        <div className="min-w-0">

                          <p className="text-xs font-bold uppercase text-gray-400">
                            Location
                          </p>

                          <p className="mt-1 text-sm font-medium text-gray-600 dark:text-gray-300">
                            {caseItem.manual_address ||
                              'GPS coordinates available'}
                          </p>

                        </div>

                      </div>

                      {/* Action */}
                      {caseItem.status === 'VALIDATION_PASSED' && (
                        <button
                          onClick={() =>
                            openDispatcher(caseItem.id)
                          }
                          className="w-full rounded-2xl bg-emerald-500 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]"
                        >
                          🦺 Find Nearby Volunteers
                        </button>
                      )}

                      {caseItem.status === 'IN_PROGRESS' && (
                        <div className="rounded-2xl bg-amber-500/10 p-3 text-center">
                          <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                            🦺 Volunteer currently handling this rescue
                          </p>
                        </div>
                      )}

                    </div>
                  );
                })}

              </div>
            )}

          </section>
        )}

        {/* ==================================================
            AI REVIEW
        ================================================== */}

        {activeSection === 'ai' && (
          <section>

            <div className="mb-4">
              <h2 className="text-lg font-extrabold text-gray-800 dark:text-gray-100">
                AI Triage Review
              </h2>

              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Review cases flagged by the AI pipeline
              </p>
            </div>

            {isJunkLoading ? (
              <div className="rounded-3xl bg-[#e2e8f0] p-10 text-center shadow-[8px_8px_16px_#cbd5e1,-8px_-8px_16px_#f8fafc] dark:bg-[#0f172a] dark:shadow-[8px_8px_16px_#070a13,-8px_-8px_16px_#172441]">

                <div className="mb-3 text-3xl animate-pulse">
                  🤖
                </div>

                <p className="text-sm font-bold text-gray-500 dark:text-gray-400">
                  Loading AI review queue...
                </p>

              </div>
            ) : junkQueue.length === 0 ? (
              <div className="rounded-3xl bg-[#e2e8f0] p-10 text-center shadow-[8px_8px_16px_#cbd5e1,-8px_-8px_16px_#f8fafc] dark:bg-[#0f172a] dark:shadow-[8px_8px_16px_#070a13,-8px_-8px_16px_#172441]">

                <div className="mb-3 text-4xl">
                  ✅
                </div>

                <p className="font-extrabold text-gray-700 dark:text-gray-200">
                  Review queue is clear
                </p>

                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  No AI-flagged cases require review.
                </p>

              </div>
            ) : (
              <div className="space-y-4">

                {junkQueue.map((caseItem) => (
                  <div
                    key={caseItem.id}
                    className="rounded-3xl bg-[#e2e8f0] p-5 shadow-[8px_8px_16px_#cbd5e1,-8px_-8px_16px_#f8fafc] dark:bg-[#0f172a] dark:shadow-[8px_8px_16px_#070a13,-8px_-8px_16px_#172441]"
                  >

                    <div className="mb-4 flex items-start justify-between gap-3">

                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                          Case #{caseItem.id}
                        </p>

                        <h3 className="mt-1 font-extrabold text-gray-800 dark:text-gray-100">
                          {caseItem.species || 'Animal Case'}
                        </h3>
                      </div>

                      <span className="text-2xl">
                        ⚠️
                      </span>

                    </div>

                    <p className="mb-5 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                      {caseItem.issue_description ||
                        caseItem.description ||
                        'No description available.'}
                    </p>

                    <button
                      onClick={() =>
                        overrideJunk(caseItem.id)
                      }
                      className="w-full rounded-2xl bg-purple-500 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-purple-500/20 transition-all active:scale-[0.98]"
                    >
                      ✓ Override — Mark as Valid
                    </button>

                  </div>
                ))}

              </div>
            )}

          </section>
        )}

      </div>

      {/* ==================================================
          VOLUNTEER MODAL
      ================================================== */}

      {dispatchModal.open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">

          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-[#e2e8f0] p-5 shadow-2xl dark:bg-[#0f172a] sm:rounded-[2rem]">

            {/* Modal Handle */}
            <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-gray-400/40 sm:hidden"></div>

            <div className="mb-5 flex items-center justify-between">

              <div>
                <h3 className="text-lg font-extrabold text-gray-800 dark:text-gray-100">
                  Nearby Volunteers
                </h3>

                <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Within 5 km of Case #{dispatchModal.caseId}
                </p>
              </div>

              <button
                onClick={() =>
                  setDispatchModal({
                    open: false,
                    caseId: null,
                    volunteers: [],
                  })
                }
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e2e8f0] text-gray-500 shadow-[4px_4px_8px_#cbd5e1,-4px_-4px_8px_#f8fafc] transition-transform active:scale-90 dark:bg-[#0f172a] dark:shadow-[4px_4px_8px_#070a13,-4px_-4px_8px_#172441]"
              >
                ✕
              </button>

            </div>

            {dispatchModal.volunteers.length === 0 ? (
              <div className="rounded-2xl bg-[#e2e8f0] p-8 text-center shadow-[inset_3px_3px_6px_#cbd5e1,inset_-3px_-3px_6px_#f8fafc] dark:bg-[#0f172a] dark:shadow-[inset_3px_3px_6px_#070a13,inset_-3px_-3px_6px_#172441]">

                <div className="mb-3 text-3xl">
                  🦺
                </div>

                <p className="font-bold text-gray-700 dark:text-gray-200">
                  No nearby volunteers
                </p>

                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  No volunteers were found within the 5 km radius.
                </p>

              </div>
            ) : (
              <div className="space-y-3">

                {dispatchModal.volunteers.map((volunteer) => (
                  <div
                    key={volunteer.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-[#e2e8f0] p-4 shadow-[5px_5px_10px_#cbd5e1,-5px_-5px_10px_#f8fafc] dark:bg-[#0f172a] dark:shadow-[5px_5px_10px_#070a13,-5px_-5px_10px_#172441]"
                  >

                    <div className="flex min-w-0 items-center gap-3">

                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-xl">
                        🦺
                      </div>

                      <div className="min-w-0">

                        <p className="truncate font-extrabold text-gray-800 dark:text-gray-100">
                          {volunteer.name ||
                            volunteer.full_name ||
                            'Volunteer'}
                        </p>

                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {Number(volunteer.distance || 0).toFixed(2)} km away
                        </p>

                      </div>

                    </div>

                    {/*
                     * IMPORTANT:
                     * The current backend only provides the nearby-volunteer
                     * search endpoint. It does not currently provide an
                     * admin "dispatch volunteer" endpoint.
                     *
                     * Therefore we do NOT pretend this button actually
                     * dispatches someone.
                     */}

                    <span className="rounded-full bg-gray-500/10 px-3 py-1.5 text-[10px] font-black text-gray-500 dark:text-gray-400">
                      AVAILABLE
                    </span>

                  </div>
                ))}

              </div>
            )}

            <button
              onClick={() =>
                setDispatchModal({
                  open: false,
                  caseId: null,
                  volunteers: [],
                })
              }
              className="mt-5 w-full rounded-2xl bg-gray-300 py-3.5 text-sm font-extrabold text-gray-700 transition-all active:scale-[0.98] dark:bg-gray-700 dark:text-gray-100"
            >
              Close
            </button>

          </div>

        </div>
      )}

    </div>
  );
}