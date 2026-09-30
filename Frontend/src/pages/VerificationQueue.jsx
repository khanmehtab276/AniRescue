import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import API from '../utils/api';
import { useToast } from '../contexts/ToastContext.jsx';
import Surface from '../components/ui/Surface.jsx';
import Button from '../components/ui/Button.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { CaseListSkeleton } from '../components/ui/LoadingState.jsx';
import { PriorityBadge } from '../components/ui/Badge.jsx';

export default function VerificationQueue() {
  const { showToast } = useToast();

  const [cases, setCases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actingId, setActingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [reason, setReason] = useState('');

  const fetchQueue = useCallback(async () => {
    setIsLoading(true);

    try {
      const { data } = await API.get('/cases/verification-queue');
      setCases(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load verification queue:', err);
      showToast('Unable to load the verification queue.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleApprove = async (id) => {
    setActingId(id);

    try {
      await API.put(`/cases/${id}/verify-completion`, { approved: true });
      showToast('Rescue verified and resolved.', 'success');
      setCases((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to verify.', 'error');
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (id) => {
    if (!reason.trim()) return;

    setActingId(id);

    try {
      await API.put(`/cases/${id}/verify-completion`, {
        approved: false,
        reason: reason.trim(),
      });
      showToast('Sent back to the volunteer.', 'success');
      setCases((prev) => prev.filter((c) => c.id !== id));
      setRejectingId(null);
      setReason('');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to send back.', 'error');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto mb-20 md:mb-0">

      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          Verification
        </p>
        <h1 className="text-2xl font-extrabold text-stone-800 dark:text-stone-100">
          Awaiting Your Review
        </h1>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Rescue evidence submitted by volunteers, pending sign-off.
        </p>
      </div>

      {isLoading ? (
        <CaseListSkeleton />
      ) : cases.length === 0 ? (
        <EmptyState
          icon="✅"
          title="All caught up"
          message="No rescue completions are currently waiting for verification."
        />
      ) : (
        <div className="space-y-4 rescue-stagger">
          {cases.map((caseItem) => (
            <Surface key={caseItem.id} className="p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <Link to={`/cases/${caseItem.id}`} className="min-w-0">
                  <h3 className="font-bold text-stone-800 dark:text-stone-100">
                    {caseItem.species || 'Animal Rescue Case'} — CASE-{caseItem.id}
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Completed {new Date(caseItem.completed_at).toLocaleString()}
                  </p>
                </Link>
                <PriorityBadge priority={caseItem.priority} />
              </div>

              {caseItem.evidence_image_payload && (
                <img
                  src={caseItem.evidence_image_payload}
                  alt="Rescue evidence"
                  className="w-full h-40 object-cover rounded-xl mb-3"
                />
              )}

              {caseItem.evidence_notes && (
                <p className="text-sm text-stone-600 dark:text-stone-300 mb-3">
                  {caseItem.evidence_notes}
                </p>
              )}

              {rejectingId === caseItem.id ? (
                <div className="space-y-2">
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why send this back?"
                    rows={2}
                    className="w-full p-3 rounded-xl text-sm bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={actingId === caseItem.id || !reason.trim()}
                      onClick={() => handleReject(caseItem.id)}
                      className="flex-1"
                    >
                      Confirm Send Back
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { setRejectingId(null); setReason(''); }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={actingId === caseItem.id}
                    onClick={() => handleApprove(caseItem.id)}
                    className="flex-1"
                  >
                    Verify & Resolve
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actingId === caseItem.id}
                    onClick={() => setRejectingId(caseItem.id)}
                    className="flex-1"
                  >
                    Send Back
                  </Button>
                </div>
              )}
            </Surface>
          ))}
        </div>
      )}

    </div>
  );
}
