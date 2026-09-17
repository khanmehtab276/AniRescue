import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('overview');
  const [cases, setCases] = useState([]);
  const [junkCases, setJunkCases] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const [casesResponse, junkResponse] = await Promise.all([
        API.get('/cases'),
        API.get('/cases/admin/junk')
      ]);

      setCases(
        Array.isArray(casesResponse.data)
          ? casesResponse.data
          : casesResponse.data?.cases || []
      );

      setJunkCases(
        Array.isArray(junkResponse.data)
          ? junkResponse.data
          : junkResponse.data?.cases || []
      );

    } catch (err) {
      console.error('Admin dashboard loading error:', err);

      try {
        const casesResponse = await API.get('/cases');

        setCases(
          Array.isArray(casesResponse.data)
            ? casesResponse.data
            : casesResponse.data?.cases || []
        );

        setJunkCases([]);
      } catch (fallbackError) {
        console.error(
          'Admin dashboard fallback error:',
          fallbackError
        );

        setError(
          fallbackError.response?.data?.error ||
          'Unable to load admin dashboard.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const statistics = useMemo(() => {
    const total = cases.length;

    const pending = cases.filter(
      (item) => item.status === 'PENDING_VALIDATION'
    ).length;

    const available = cases.filter(
      (item) =>
        item.status === 'VALIDATION_PASSED' &&
        !item.assigned_volunteer_id
    ).length;

    const active = cases.filter(
      (item) => item.status === 'IN_PROGRESS'
    ).length;

    const resolved = cases.filter(
      (item) => item.status === 'RESOLVED'
    ).length;

    const rejected = cases.filter(
      (item) => item.status === 'REJECTED_JUNK'
    ).length;

    return {
      total,
      pending,
      available,
      active,
      resolved,
      rejected
    };
  }, [cases]);

  const recentCases = useMemo(
    () => cases.slice(0, 3),
    [cases]
  );

  const handleStatusChange = async (caseId, status) => {
    setProcessingId(caseId);
    setError('');

    try {
      await API.put(
        `/cases/${caseId}/status`,
        { status }
      );

      await loadDashboard();
    } catch (err) {
      console.error(
        'Case status update error:',
        err
      );

      setError(
        err.response?.data?.error ||
        'Unable to update case status.'
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleVerifyJunk = async (caseId, approved) => {
    setProcessingId(caseId);
    setError('');

    try {
      await API.put(
        `/cases/${caseId}/verify-junk`,
        { approved }
      );

      await loadDashboard();
    } catch (err) {
      console.error(
        'Junk verification error:',
        err
      );

      setError(
        err.response?.data?.error ||
        'Unable to verify this case.'
      );
    } finally {
      setProcessingId(null);
    }
  };

  const stats = [
    {
      label: 'Total Cases',
      value: statistics.total,
      icon: '📋'
    },
    {
      label: 'AI Review',
      value: statistics.pending,
      icon: '🤖'
    },
    {
      label: 'Available',
      value: statistics.available,
      icon: '🆘'
    },
    {
      label: 'Active',
      value: statistics.active,
      icon: '🚑'
    },
    {
      label: 'Resolved',
      value: statistics.resolved,
      icon: '✅'
    },
    {
      label: 'Rejected',
      value: statistics.rejected,
      icon: '🚫'
    }
  ];

  return (
    <div className="min-h-screen px-4 pb-24 pt-6">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3">

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                Administration
              </p>

              <h1 className="text-2xl font-extrabold text-gray-800 dark:text-gray-100">
                Rescue Control Center
              </h1>

              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Welcome, {user?.name || 'Administrator'}
              </p>
            </div>

            <div className="w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-2xl bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[6px_6px_12px_#cbd5e1,_-6px_-6px_12px_#f8fafc] dark:shadow-[6px_6px_12px_#070a13,_-6px_-6px_12px_#172441]">
              🛡️
            </div>

          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-5 rounded-xl border border-rose-200 dark:border-rose-800/50 bg-rose-100 dark:bg-rose-900/30 px-4 py-3 text-sm font-semibold text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6">

          {[
            ['overview', 'Overview'],
            ['cases', 'Cases'],
            ['review', 'AI Review']
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setActiveTab(value)}
              className={`shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                activeTab === value
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'bg-[#e2e8f0] dark:bg-[#0f172a] text-gray-600 dark:text-gray-300 shadow-[4px_4px_8px_#cbd5e1,_-4px_-4px_8px_#f8fafc] dark:shadow-[4px_4px_8px_#070a13,_-4px_-4px_8px_#172441]'
              }`}
            >
              {label}
            </button>
          ))}

        </div>

        {isLoading ? (
          <div className="py-20 text-center">
            <div className="text-4xl mb-3 animate-pulse">
              🐾
            </div>

            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
              Loading rescue operations...
            </p>
          </div>
        ) : (
          <>
            {/* OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="space-y-6">

                <div className="grid grid-cols-2 gap-3">
                  {stats.map((stat) => (
                    <div
                      key={stat.label}
                      className="p-4 rounded-2xl bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[6px_6px_12px_#cbd5e1,_-6px_-6px_12px_#f8fafc] dark:shadow-[6px_6px_12px_#070a13,_-6px_-6px_12px_#172441]"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xl">
                          {stat.icon}
                        </span>

                        <span className="text-2xl font-extrabold text-gray-800 dark:text-gray-100">
                          {stat.value}
                        </span>
                      </div>

                      <p className="text-xs font-bold text-gray-500 dark:text-gray-400">
                        {stat.label}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Quick Actions */}
                <section>
                  <h2 className="mb-3 text-lg font-extrabold text-gray-800 dark:text-gray-100">
                    Quick Actions
                  </h2>

                  <div className="grid grid-cols-2 gap-3">

                    <button
                      onClick={() => setActiveTab('cases')}
                      className="p-4 rounded-2xl text-left bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[6px_6px_12px_#cbd5e1,_-6px_-6px_12px_#f8fafc] dark:shadow-[6px_6px_12px_#070a13,_-6px_-6px_12px_#172441] hover:-translate-y-0.5 transition-all"
                    >
                      <div className="text-2xl mb-2">
                        📋
                      </div>

                      <p className="font-bold text-gray-800 dark:text-gray-100">
                        Manage Cases
                      </p>

                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        View and update rescue cases
                      </p>
                    </button>

                    <button
                      onClick={() => setActiveTab('review')}
                      className="p-4 rounded-2xl text-left bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[6px_6px_12px_#cbd5e1,_-6px_-6px_12px_#f8fafc] dark:shadow-[6px_6px_12px_#070a13,_-6px_-6px_12px_#172441] hover:-translate-y-0.5 transition-all"
                    >
                      <div className="text-2xl mb-2">
                        🤖
                      </div>

                      <p className="font-bold text-gray-800 dark:text-gray-100">
                        AI Review Queue
                      </p>

                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Review cases flagged as junk
                      </p>
                    </button>

                    <button
                      onClick={() => navigate('/map')}
                      className="col-span-2 p-4 rounded-2xl text-left bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[6px_6px_12px_#cbd5e1,_-6px_-6px_12px_#f8fafc] dark:shadow-[6px_6px_12px_#070a13,_-6px_-6px_12px_#172441] hover:-translate-y-0.5 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">
                          🗺️
                        </span>

                        <div>
                          <p className="font-bold text-gray-800 dark:text-gray-100">
                            Live Rescue Map
                          </p>

                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            View active rescue locations
                          </p>
                        </div>
                      </div>
                    </button>

                  </div>
                </section>

                {/* Recent Cases */}
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-extrabold text-gray-800 dark:text-gray-100">
                      Recent Cases
                    </h2>

                    <button
                      onClick={() => setActiveTab('cases')}
                      className="text-xs font-bold text-purple-600 dark:text-purple-400"
                    >
                      View all
                    </button>
                  </div>

                  {recentCases.length === 0 ? (
                    <EmptyState
                      icon="📭"
                      title="No rescue cases"
                      message="No cases have been reported yet."
                    />
                  ) : (
                    <div className="space-y-3">
                      {recentCases.map((item) => (
                        <AdminCaseCard
                          key={item.id}
                          caseData={item}
                          processingId={processingId}
                          onStatusChange={handleStatusChange}
                        />
                      ))}
                    </div>
                  )}
                </section>

              </div>
            )}

            {/* CASES */}
            {activeTab === 'cases' && (
              <section>
                <div className="mb-4">
                  <h2 className="text-xl font-extrabold text-gray-800 dark:text-gray-100">
                    Rescue Cases
                  </h2>

                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Monitor and manage reported rescue operations.
                  </p>
                </div>

                {cases.length === 0 ? (
                  <EmptyState
                    icon="📭"
                    title="No cases available"
                    message="There are currently no rescue cases."
                  />
                ) : (
                  <div className="space-y-4">
                    {cases.map((item) => (
                      <AdminCaseCard
                        key={item.id}
                        caseData={item}
                        processingId={processingId}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* AI REVIEW */}
            {activeTab === 'review' && (
              <section>
                <div className="mb-4">
                  <h2 className="text-xl font-extrabold text-gray-800 dark:text-gray-100">
                    AI Review Queue
                  </h2>

                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Cases currently marked as rejected by validation.
                  </p>
                </div>

                {junkCases.length === 0 ? (
                  <EmptyState
                    icon="✨"
                    title="Review queue is empty"
                    message="There are no rejected cases waiting for review."
                  />
                ) : (
                  <div className="space-y-4">
                    {junkCases.map((item) => (
                      <JunkReviewCard
                        key={item.id}
                        caseData={item}
                        processingId={processingId}
                        onConfirmJunk={() =>
                          handleVerifyJunk(item.id, false)
                        }
                        onReleaseCase={() =>
                          handleVerifyJunk(item.id, true)
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}

      </div>
    </div>
  );
}


/* =========================================================
   ADMIN CASE CARD
========================================================= */

function AdminCaseCard({
  caseData,
  processingId,
  onStatusChange
}) {
  const {
    id,
    species,
    issue_description,
    priority,
    status,
    manual_address,
    latitude,
    longitude,
    assigned_volunteer_id,
    created_at,
    image_payload
  } = caseData;

  const isProcessing = processingId === id;

  const formattedDate = created_at
    ? new Date(created_at).toLocaleString()
    : 'Unknown time';

  return (
    <div className="rounded-2xl p-4 bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[6px_6px_12px_#cbd5e1,_-6px_-6px_12px_#f8fafc] dark:shadow-[6px_6px_12px_#070a13,_-6px_-6px_12px_#172441]">

      {image_payload && (
        <div className="mb-4 overflow-hidden rounded-xl">
          <img
            src={image_payload}
            alt="Reported animal"
            className="w-full max-h-64 object-cover"
            loading="lazy"
          />
        </div>
      )}

      <div className="flex items-start justify-between gap-3">

        <div className="min-w-0">
          <h3 className="font-extrabold text-gray-800 dark:text-gray-100 truncate">
            {species || 'Animal Rescue Case'}
          </h3>

          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Case #{id}
          </p>
        </div>

        <StatusBadge status={status} />
      </div>

      {issue_description && (
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          {issue_description}
        </p>
      )}

      <div className="mt-4 space-y-2 text-xs text-gray-500 dark:text-gray-400">

        {priority && (
          <div>
            <span className="font-bold">
              Priority:
            </span>{' '}
            {priority}
          </div>
        )}

        {manual_address && (
          <div>
            <span className="font-bold">
              Location:
            </span>{' '}
            {manual_address}
          </div>
        )}

        {latitude !== null &&
          latitude !== undefined &&
          longitude !== null &&
          longitude !== undefined && (
            <div>
              <span className="font-bold">
                Coordinates:
              </span>{' '}
              {Number(latitude).toFixed(5)},{' '}
              {Number(longitude).toFixed(5)}
            </div>
          )}

        <div>
          <span className="font-bold">
            Reported:
          </span>{' '}
          {formattedDate}
        </div>

        {assigned_volunteer_id && (
          <div>
            <span className="font-bold">
              Volunteer:
            </span>{' '}
            Assigned
          </div>
        )}

      </div>

      <div className="mt-4">

        {status === 'PENDING_VALIDATION' && (
          <button
            disabled={isProcessing}
            onClick={() =>
              onStatusChange(
                id,
                'VALIDATION_PASSED'
              )
            }
            className="w-full rounded-xl px-4 py-3 text-sm font-bold bg-emerald-600 text-white disabled:opacity-50 transition-all"
          >
            {isProcessing
              ? 'Processing...'
              : 'Approve Case'}
          </button>
        )}

        {status === 'VALIDATION_PASSED' && (
          <div className="rounded-xl bg-amber-100 dark:bg-amber-900/20 px-4 py-3 text-center text-sm font-bold text-amber-700 dark:text-amber-400">
            Waiting for Volunteer
          </div>
        )}

        {status === 'IN_PROGRESS' && (
          <button
            disabled={isProcessing}
            onClick={() =>
              onStatusChange(
                id,
                'RESOLVED'
              )
            }
            className="w-full rounded-xl px-4 py-3 text-sm font-bold bg-emerald-600 text-white disabled:opacity-50 transition-all"
          >
            {isProcessing
              ? 'Updating...'
              : 'Mark Resolved'}
          </button>
        )}

        {status === 'RESOLVED' && (
          <div className="rounded-xl bg-emerald-100 dark:bg-emerald-900/20 px-4 py-3 text-center text-sm font-bold text-emerald-700 dark:text-emerald-400">
            Rescue Completed
          </div>
        )}

        {status === 'REJECTED_JUNK' && (
          <div className="rounded-xl bg-rose-100 dark:bg-rose-900/20 px-4 py-3 text-center text-sm font-bold text-rose-700 dark:text-rose-400">
            Marked as Junk
          </div>
        )}

        {status === 'CANCELLED' && (
          <div className="rounded-xl bg-gray-200 dark:bg-gray-800 px-4 py-3 text-center text-sm font-bold text-gray-600 dark:text-gray-400">
            Cancelled
          </div>
        )}

      </div>
    </div>
  );
}


/* =========================================================
   JUNK REVIEW CARD
========================================================= */

function JunkReviewCard({
  caseData,
  processingId,
  onConfirmJunk,
  onReleaseCase
}) {
  const {
    id,
    species,
    issue_description,
    priority,
    manual_address,
    image_payload,
    created_at
  } = caseData;

  const isProcessing = processingId === id;

  return (
    <div className="rounded-2xl p-4 bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[6px_6px_12px_#cbd5e1,_-6px_-6px_12px_#f8fafc] dark:shadow-[6px_6px_12px_#070a13,_-6px_-6px_12px_#172441]">

      {image_payload && (
        <div className="mb-4 overflow-hidden rounded-xl">
          <img
            src={image_payload}
            alt="Reported animal"
            className="w-full max-h-64 object-cover"
            loading="lazy"
          />
        </div>
      )}

      <div className="flex items-start justify-between gap-3">

        <div>
          <h3 className="font-extrabold text-gray-800 dark:text-gray-100">
            {species || 'Animal Case'}
          </h3>

          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Case #{id}
          </p>
        </div>

        <StatusBadge status="REJECTED_JUNK" />
      </div>

      {issue_description && (
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          {issue_description}
        </p>
      )}

      <div className="mt-3 space-y-1 text-xs text-gray-500 dark:text-gray-400">

        {priority && (
          <p>
            <span className="font-bold">
              Priority:
            </span>{' '}
            {priority}
          </p>
        )}

        {manual_address && (
          <p>
            <span className="font-bold">
              Location:
            </span>{' '}
            {manual_address}
          </p>
        )}

        {created_at && (
          <p>
            <span className="font-bold">
              Reported:
            </span>{' '}
            {new Date(created_at).toLocaleString()}
          </p>
        )}

      </div>

      <div className="grid grid-cols-2 gap-3 mt-5">

        <button
          disabled={isProcessing}
          onClick={onConfirmJunk}
          className="rounded-xl px-3 py-3 text-sm font-bold bg-rose-600 text-white disabled:opacity-50 transition-all"
        >
          {isProcessing
            ? 'Processing...'
            : 'Confirm Junk'}
        </button>

        <button
          disabled={isProcessing}
          onClick={onReleaseCase}
          className="rounded-xl px-3 py-3 text-sm font-bold bg-emerald-600 text-white disabled:opacity-50 transition-all"
        >
          {isProcessing
            ? 'Processing...'
            : 'Release Case'}
        </button>

      </div>
    </div>
  );
}


/* =========================================================
   STATUS BADGE
========================================================= */

function StatusBadge({ status }) {
  const config = {
    PENDING_VALIDATION: {
      label: 'Pending AI',
      className:
        'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
    },

    VALIDATION_PASSED: {
      label: 'Verified',
      className:
        'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
    },

    REJECTED_JUNK: {
      label: 'Junk',
      className:
        'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'
    },

    IN_PROGRESS: {
      label: 'In Progress',
      className:
        'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
    },

    RESOLVED: {
      label: 'Resolved',
      className:
        'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
    },

    CANCELLED: {
      label: 'Cancelled',
      className:
        'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
    }
  };

  const current =
    config[status] || {
      label: status || 'Unknown',
      className:
        'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
    };

  return (
    <span
      className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${current.className}`}
    >
      {current.label}
    </span>
  );
}


/* =========================================================
   EMPTY STATE
========================================================= */

function EmptyState({
  icon,
  title,
  message
}) {
  return (
    <div className="rounded-2xl p-8 text-center bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[6px_6px_12px_#cbd5e1,_-6px_-6px_12px_#f8fafc] dark:shadow-[6px_6px_12px_#070a13,_-6px_-6px_12px_#172441]">

      <div className="text-4xl mb-3">
        {icon}
      </div>

      <h3 className="font-extrabold text-gray-800 dark:text-gray-100">
        {title}
      </h3>

      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {message}
      </p>

    </div>
  );
}