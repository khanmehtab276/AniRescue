import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import API from '../utils/api';

/* =========================================================
   STATUS CONFIG
========================================================= */

const STATUS_CONFIG = {
  PENDING_VALIDATION: {
    label: 'Pending AI Review',
    icon: '🤖',
    className:
      'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  PROCESSING_ANALYSIS: {
    label: 'Analyzing',
    icon: '🔍',
    className:
      'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  VALIDATION_PASSED: {
    label: 'Verified — Awaiting Volunteer',
    icon: '✅',
    className:
      'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  IN_PROGRESS: {
    label: 'Rescue In Progress',
    icon: '🚑',
    className:
      'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  RESOLVED: {
    label: 'Resolved',
    icon: '🎉',
    className:
      'bg-green-500/10 text-green-600 dark:text-green-400',
  },
  REJECTED_JUNK: {
    label: 'Not Verified',
    icon: '🚫',
    className:
      'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  },
  CANCELLED: {
    label: 'Cancelled',
    icon: '⛔',
    className:
      'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  },
};

function getStatusConfig(status) {
  return (
    STATUS_CONFIG[status] || {
      label: status || 'Unknown',
      icon: '❔',
      className:
        'bg-gray-500/10 text-gray-600 dark:text-gray-400',
    }
  );
}

/* =========================================================
   USER DASHBOARD
========================================================= */

export default function UserDashboard() {
  const { user } = useAuth();

  const [cases, setCases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchMyCases = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const { data } = await API.get('/cases/mine');

      setCases(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load your reported cases:', err);

      setError(
        err.response?.data?.error ||
          'Unable to load your reported cases right now.',
      );

      setCases([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMyCases();
  }, [fetchMyCases]);

  const stats = {
    total: cases.length,
    active: cases.filter((c) =>
      ['PENDING_VALIDATION', 'PROCESSING_ANALYSIS', 'VALIDATION_PASSED', 'IN_PROGRESS'].includes(
        c.status,
      ),
    ).length,
    resolved: cases.filter((c) => c.status === 'RESOLVED').length,
  };

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto mb-20 md:mb-0 transition-colors duration-300">

      {/* HEADER */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-2xl bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[6px_6px_12px_#cbd5e1,_-6px_-6px_12px_#f8fafc] dark:shadow-[6px_6px_12px_#070a13,_-6px_-6px_12px_#172441]">
          🐾
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            My AniRescue
          </p>

          <h1 className="text-2xl font-extrabold text-gray-800 dark:text-gray-100">
            Hi, {user?.name?.split(' ')[0] || 'there'} 👋
          </h1>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Reported" value={stats.total} color="text-gray-800 dark:text-gray-100" />
        <StatCard label="In Progress" value={stats.active} color="text-amber-500" />
        <StatCard label="Resolved" value={stats.resolved} color="text-emerald-500" />
      </div>

      {/* QUICK ACTIONS */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <Link
          to="/report"
          className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl bg-emerald-600 text-white font-extrabold shadow-lg hover:-translate-y-0.5 transition-all text-center"
        >
          <span className="text-2xl">🚨</span>
          Report a Case
        </Link>

        <Link
          to="/map"
          className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl bg-[#e2e8f0] dark:bg-[#0f172a] text-gray-700 dark:text-gray-200 font-extrabold shadow-[6px_6px_12px_#cbd5e1,_-6px_-6px_12px_#f8fafc] dark:shadow-[6px_6px_12px_#070a13,_-6px_-6px_12px_#172441] hover:-translate-y-0.5 transition-all text-center"
        >
          <span className="text-2xl">🗺️</span>
          View Live Map
        </Link>
      </div>

      {/* MY REPORTED CASES */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-gray-800 dark:text-gray-100">
          My Reported Cases
        </h2>

        <button
          type="button"
          onClick={fetchMyCases}
          disabled={isLoading}
          className="text-xs font-bold text-blue-600 dark:text-blue-400 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 text-sm font-bold text-center text-rose-500 bg-rose-100 dark:bg-rose-900/30 rounded-xl border border-rose-200 dark:border-rose-800/50">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {isLoading ? (
          <div className="p-8 text-center text-sm font-bold text-gray-500 dark:text-gray-400 rounded-2xl bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[inset_4px_4px_8px_#cbd5e1,inset_-4px_-4px_8px_#f8fafc] dark:shadow-[inset_4px_4px_8px_#070a13,inset_-4px_-4px_8px_#172441]">
            Loading your reports...
          </div>
        ) : cases.length === 0 ? (
          <div className="p-10 text-center rounded-2xl bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[inset_4px_4px_8px_#cbd5e1,inset_-4px_-4px_8px_#f8fafc] dark:shadow-[inset_4px_4px_8px_#070a13,inset_-4px_-4px_8px_#172441]">
            <div className="text-4xl mb-3">🐕</div>

            <p className="font-extrabold text-gray-700 dark:text-gray-200">
              No reports yet
            </p>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Cases you report will show up here so you can track their rescue status.
            </p>
          </div>
        ) : (
          cases.map((caseItem) => {
            const status = getStatusConfig(caseItem.status);

            return (
              <div
                key={caseItem.id}
                className="p-5 rounded-2xl bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[6px_6px_12px_#cbd5e1,_-6px_-6px_12px_#f8fafc] dark:shadow-[6px_6px_12px_#070a13,_-6px_-6px_12px_#172441]"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-800 dark:text-gray-100 truncate">
                      {caseItem.species || 'Animal Rescue Case'}
                    </h3>

                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400">
                      CASE-{caseItem.id}
                      {caseItem.created_at &&
                        ` • ${new Date(caseItem.created_at).toLocaleDateString()}`}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full ${status.className}`}
                  >
                    {status.icon} {status.label}
                  </span>
                </div>

                {caseItem.image_payload && (
                  <img
                    src={caseItem.image_payload}
                    alt="Reported animal"
                    className="w-full h-40 object-cover rounded-xl mb-3"
                    loading="lazy"
                  />
                )}

                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                  {caseItem.issue_description || 'No description provided.'}
                </p>

                {caseItem.manual_address && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    📍 {caseItem.manual_address}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* COMING SOON — kept honest rather than faking functionality */}
      <div className="mt-8 p-5 rounded-2xl text-center bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[inset_4px_4px_8px_#cbd5e1,inset_-4px_-4px_8px_#f8fafc] dark:shadow-[inset_4px_4px_8px_#070a13,inset_-4px_-4px_8px_#172441]">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Coming Soon
        </p>

        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Adoption feed and rescuer badges are on the roadmap.
        </p>
      </div>

    </div>
  );
}

/* =========================================================
   STAT CARD
========================================================= */

function StatCard({ label, value, color }) {
  return (
    <div className="p-4 rounded-2xl text-center bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[5px_5px_10px_#cbd5e1,_-5px_-5px_10px_#f8fafc] dark:shadow-[5px_5px_10px_#070a13,_-5px_-5px_10px_#172441]">
      <p className={`text-2xl font-black ${color}`}>{value}</p>

      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
    </div>
  );
}
