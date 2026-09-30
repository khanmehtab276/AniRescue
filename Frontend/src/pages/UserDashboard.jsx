import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Siren, PawPrint, Activity, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import API from '../utils/api';
import Surface from '../components/ui/Surface.jsx';
import Button from '../components/ui/Button.jsx';
import BentoStats from '../components/ui/BentoStats.jsx';
import CaseCard from '../components/ui/CaseCard.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { CaseListSkeleton } from '../components/ui/LoadingState.jsx';
import SectionHeader from '../components/ui/SectionHeader.jsx';

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
        err.response?.data?.error || 'Unable to load your reported cases right now.',
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
      ['PENDING_VALIDATION', 'PROCESSING_ANALYSIS', 'VALIDATION_PASSED', 'IN_PROGRESS', 'RESCUE_COMPLETED'].includes(
        c.status,
      ),
    ).length,
    resolved: cases.filter((c) => c.status === 'RESOLVED').length,
  };

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto mb-20 md:mb-0">

      {/* HEADER — one clear CTA, no giant Report/Map tiles */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            My AniRescue
          </p>
          <h1 className="text-2xl font-extrabold text-stone-800 dark:text-stone-100">
            Hi, {user?.name?.split(' ')[0] || 'there'}
          </h1>
        </div>

        <Button as={Link} to="/report" variant="urgent" size="sm">
          <Siren size={14} strokeWidth={2.5} /> Report
        </Button>
      </div>

      {/* STATS */}
      <div className="mb-8">
        <BentoStats
          items={[
            { label: 'Total Reported', value: stats.total, tone: 'neutral', Icon: PawPrint },
            { label: 'In Progress', value: stats.active, tone: 'warning', Icon: Activity },
            { label: 'Resolved', value: stats.resolved, tone: 'success', Icon: CheckCircle2 },
          ]}
        />
      </div>

      <SectionHeader
        title="My Reported Cases"
        action={
          <button
            type="button"
            onClick={fetchMyCases}
            disabled={isLoading}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 disabled:opacity-50"
          >
            Refresh
          </button>
        }
      />

      {error && (
        <div className="mb-4 p-3 text-sm font-bold text-center text-rose-500 bg-rose-100 dark:bg-rose-900/30 rounded-xl border border-rose-200 dark:border-rose-800/50">
          {error}
        </div>
      )}

      {isLoading ? (
        <CaseListSkeleton />
      ) : cases.length === 0 ? (
        <EmptyState
          icon="🐕"
          title="No reports yet"
          message="Cases you report will show up here so you can track their rescue status."
        />
      ) : (
        <div className="space-y-4 rescue-stagger">
          {cases.map((caseItem) => (
            <CaseCard
              key={caseItem.id}
              caseItem={caseItem}
              friendly
              action={
                <Link
                  to={`/cases/${caseItem.id}`}
                  className="text-xs font-bold text-emerald-600 dark:text-emerald-400"
                >
                  View Progress →
                </Link>
              }
            />
          ))}
        </div>
      )}

      {/* Honest placeholder, not fake functionality */}
      <Surface inset className="mt-8 p-5 text-center">
        <p className="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
          Coming Soon
        </p>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Adoption feed and rescuer badges are on the roadmap.
        </p>
      </Surface>

    </div>
  );
}
