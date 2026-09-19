import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import API from '../utils/api';

export default function VolunteerDashboard() {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState('available');
  const [cases, setCases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  const { user } = useAuth();

  const volunteerId = user?.id;

  const fetchCases = useCallback(async () => {
    if (!volunteerId) {
      return;
    }

    setIsLoading(true);

    try {
      /*
       * This endpoint returns cases that have passed AI validation
       * and have not yet been assigned to a volunteer.
       */
      const { data } = await API.get(
        '/cases/volunteer/available'
      );

      setCases(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(
        'Failed to load volunteer cases:',
        error
      );

      setCases([]);
    } finally {
      setIsLoading(false);
    }
  }, [volunteerId]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const handleClaimCase = async (caseId) => {
    if (!caseId || processingId === caseId) {
      return;
    }

    setProcessingId(caseId);

    try {
      await API.put(`/cases/${caseId}/claim`);

      /*
       * Refresh from backend instead of manually guessing
       * the new case state. Both lists need refreshing since
       * the claimed case moves from "available" into "myCases".
       */
      await Promise.all([fetchCases(), fetchMyCases()]);

      setActiveTab('active');

      showToast('Case claimed. It now appears under Active.', 'success');
    } catch (error) {
      console.error(
        'Failed to claim case:',
        error
      );

      const message =
        error.response?.data?.error ||
        error.response?.data?.message ||
        'Failed to claim this rescue case. It may already have been claimed by another volunteer.';

      showToast(message, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleResolveCase = async (caseId) => {
    if (!caseId || processingId === caseId) {
      return;
    }

    setProcessingId(caseId);

    try {
      await API.put(`/cases/${caseId}/status`, {
        status: 'RESOLVED'
      });

      await Promise.all([fetchCases(), fetchMyCases()]);

      setActiveTab('resolved');

      showToast('Rescue marked as resolved. Thank you!', 'success');
    } catch (error) {
      console.error(
        'Failed to resolve case:',
        error
      );

      const message =
        error.response?.data?.error ||
        error.response?.data?.message ||
        'Failed to mark the rescue as resolved.';

      showToast(message, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  /*
   * The available endpoint only returns unassigned
   * VALIDATION_PASSED cases.
   *
   * The broader /cases endpoint can contain the volunteer's
   * active/resolved cases, so we load those separately.
   */
  const [myCases, setMyCases] = useState([]);

  const fetchMyCases = useCallback(async () => {
    if (!volunteerId) {
      return;
    }

    try {
      const { data } = await API.get('/cases');

      const allCases = Array.isArray(data) ? data : [];

      const assignedCases = allCases.filter(
        (caseItem) =>
          String(caseItem.assigned_volunteer_id) ===
          String(volunteerId)
      );

      setMyCases(assignedCases);
    } catch (error) {
      console.error(
        'Failed to load assigned cases:',
        error
      );

      setMyCases([]);
    }
  }, [volunteerId]);

  useEffect(() => {
    fetchMyCases();
  }, [fetchMyCases]);

  const activeCases = myCases.filter(
    (caseItem) =>
      caseItem.status === 'IN_PROGRESS'
  );

  const resolvedCases = myCases.filter(
    (caseItem) =>
      caseItem.status === 'RESOLVED'
  );

  const displayedCases =
    activeTab === 'available'
      ? cases
      : activeTab === 'active'
        ? activeCases
        : resolvedCases;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto mb-20 md:mb-0 transition-colors duration-300">

      {/* HEADER */}
      <div className="text-center mb-10">
        <h2 className="text-3xl font-extrabold text-gray-800 dark:text-gray-100 mb-2">
          Volunteer Dispatch
        </h2>

        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          View verified rescue cases and manage your assigned operations.
        </p>
      </div>

      <div className="rounded-[2rem] p-6 md:p-8 transition-colors duration-300 bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[10px_10px_20px_#cbd5e1,_-10px_-10px_20px_#f8fafc] dark:shadow-[10px_10px_20px_#070a13,_-10px_-10px_20px_#172441]">

        {/* TABS */}
        <div className="flex p-1.5 rounded-xl mb-8 transition-colors duration-300 bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[inset_4px_4px_8px_#cbd5e1,inset_-4px_-4px_8px_#f8fafc] dark:shadow-[inset_4px_4px_8px_#070a13,inset_-4px_-4px_8px_#172441]">

          {[
            {
              id: 'available',
              label: 'Available'
            },
            {
              id: 'active',
              label: 'Active'
            },
            {
              id: 'resolved',
              label: 'Resolved'
            }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 rounded-lg text-xs md:text-sm font-bold transition-all duration-300 ${
                activeTab === tab.id
                  ? 'bg-[#1a1f2e] dark:bg-black text-white shadow-[0_4px_10px_rgba(0,0,0,0.3)]'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}

        </div>

        {/* QUEUE */}
        <div>
          <div className="flex items-center justify-between mb-4 ml-2">
            <h3 className="text-xs uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
              {activeTab === 'available'
                ? 'Verified Rescue Queue'
                : activeTab === 'active'
                  ? 'My Active Rescues'
                  : 'Completed Rescues'}
            </h3>

            <button
              type="button"
              onClick={() => {
                fetchCases();
                fetchMyCases();
              }}
              disabled={isLoading}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          <div className="space-y-4">

            {isLoading && activeTab === 'available' ? (
              <div className="p-8 text-center text-sm font-bold text-gray-500 dark:text-gray-400 rounded-2xl bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[inset_4px_4px_8px_#cbd5e1,inset_-4px_-4px_8px_#f8fafc] dark:shadow-[inset_4px_4px_8px_#070a13,inset_-4px_-4px_8px_#172441]">
                Syncing verified rescue cases...
              </div>
            ) : displayedCases.length === 0 ? (
              <div className="p-8 text-center text-sm font-bold text-gray-500 dark:text-gray-400 rounded-2xl bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[inset_4px_4px_8px_#cbd5e1,inset_-4px_-4px_8px_#f8fafc] dark:shadow-[inset_4px_4px_8px_#070a13,inset_-4px_-4px_8px_#172441]">
                {activeTab === 'available'
                  ? 'No verified rescue cases are currently available.'
                  : activeTab === 'active'
                    ? 'You have no active rescue cases.'
                    : 'You have no completed rescue cases yet.'}
              </div>
            ) : (
              displayedCases.map((caseItem) => (
                <div
                  key={caseItem.id}
                  className="p-5 rounded-2xl transition-all duration-300 bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[6px_6px_12px_#cbd5e1,_-6px_-6px_12px_#f8fafc] dark:shadow-[6px_6px_12px_#070a13,_-6px_-6px_12px_#172441]"
                >

                  {/* CASE HEADER */}
                  <div className="flex justify-between items-start mb-3 gap-3">

                    <div className="min-w-0">
                      <h4 className="font-bold text-gray-800 dark:text-gray-100 text-lg">
                        {caseItem.species || 'Animal Rescue'}
                      </h4>

                      <p className="text-xs font-bold text-gray-500 dark:text-gray-400">
                        CASE-{caseItem.id}
                        {' • '}
                        {caseItem.priority || 'Normal'} Priority
                      </p>
                    </div>

                    <span className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[inset_2px_2px_4px_#cbd5e1,inset_-2px_-2px_4px_#f8fafc] dark:shadow-[inset_2px_2px_4px_#070a13,inset_-2px_-2px_4px_#172441]">
                      {caseItem.priority === 'High'
                        ? '🚨'
                        : '⚠️'}
                    </span>

                  </div>

                  {/* IMAGE */}
                  {caseItem.image_payload && (
                    <img
                      src={caseItem.image_payload}
                      alt="Reported rescue animal"
                      className="w-full h-48 object-cover rounded-xl mb-4"
                      loading="lazy"
                    />
                  )}

                  {/* DESCRIPTION */}
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-4 bg-black/5 dark:bg-white/5 p-3 rounded-xl border border-gray-300/50 dark:border-white/5">
                    {caseItem.issue_description ||
                      'No description provided.'}
                  </p>

                  {/* LOCATION */}
                  {(caseItem.manual_address ||
                    caseItem.latitude != null) && (
                    <div className="mb-4 p-3 rounded-xl bg-black/5 dark:bg-white/5">
                      <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                        Location
                      </p>

                      {caseItem.manual_address && (
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          📍 {caseItem.manual_address}
                        </p>
                      )}

                      {caseItem.latitude != null &&
                        caseItem.longitude != null && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            GPS: {Number(caseItem.latitude).toFixed(4)},
                            {' '}
                            {Number(caseItem.longitude).toFixed(4)}
                          </p>
                        )}
                    </div>
                  )}

                  {/* STATUS */}
                  <div className="mb-4">
                    <span className="inline-flex text-xs font-black px-3 py-1 rounded-full bg-blue-200 text-blue-800">
                      {caseItem.status?.replace(
                        /_/g,
                        ' '
                      )}
                    </span>
                  </div>

                  {/* ACTIONS */}
                  <div className="flex gap-3">

                    {activeTab === 'available' && (
                      <button
                        type="button"
                        onClick={() =>
                          handleClaimCase(caseItem.id)
                        }
                        disabled={
                          processingId === caseItem.id
                        }
                        className="flex-1 py-3 rounded-xl text-sm font-bold bg-[#1a1f2e] dark:bg-black text-white shadow-[0_4px_10px_rgba(0,0,0,0.3)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
                      >
                        {processingId === caseItem.id
                          ? 'Claiming...'
                          : 'Accept Case'}
                      </button>
                    )}

                    {activeTab === 'active' && (
                      <button
                        type="button"
                        onClick={() =>
                          handleResolveCase(
                            caseItem.id
                          )
                        }
                        disabled={
                          processingId === caseItem.id
                        }
                        className="flex-1 py-3 rounded-xl text-sm font-bold bg-emerald-500 text-white shadow-[0_4px_10px_rgba(16,185,129,0.3)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
                      >
                        {processingId === caseItem.id
                          ? 'Updating...'
                          : 'Mark as Resolved'}
                      </button>
                    )}

                    {activeTab === 'resolved' && (
                      <div className="flex-1 py-3 rounded-xl text-sm font-bold text-center bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[inset_4px_4px_8px_#cbd5e1,inset_-4px_-4px_8px_#f8fafc] dark:shadow-[inset_4px_4px_8px_#070a13,inset_-4px_-4px_8px_#172441] text-gray-400 dark:text-gray-500">
                        Rescue Completed ✅
                      </div>
                    )}

                  </div>

                </div>
              ))
            )}

          </div>
        </div>

      </div>
    </div>
  );
}