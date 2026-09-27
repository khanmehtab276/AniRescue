import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import API from '../utils/api';
import { uploadImageToCloudinary } from '../utils/uploadImage';
import Surface from '../components/ui/Surface.jsx';
import Button from '../components/ui/Button.jsx';
import { StatusBadge, PriorityBadge } from '../components/ui/Badge.jsx';
import CaseTimeline from '../components/ui/CaseTimeline.jsx';
import { CaseCardSkeleton } from '../components/ui/LoadingState.jsx';

const PRIORITY_OPTIONS = ['LOW', 'STANDARD', 'HIGH', 'CRITICAL'];

export default function CaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const role = (user?.role || '').toUpperCase();

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isActing, setIsActing] = useState(false);

  // Evidence submission form (volunteer)
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);

  // Rejection reason (verifier)
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  const fetchCase = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const { data } = await API.get(`/cases/${id}`);
      setData(data);
    } catch (err) {
      console.error('Failed to load case:', err);
      setError(
        err.response?.data?.error || 'Unable to load this case.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCase();
  }, [fetchCase]);

  const handleClaim = async () => {
    setIsActing(true);

    try {
      await API.put(`/cases/${id}/claim`);
      showToast('Case claimed — it now appears under your active rescues.', 'success');
      await fetchCase();
    } catch (err) {
      showToast(
        err.response?.data?.error || 'This case may already be claimed.',
        'error'
      );
    } finally {
      setIsActing(false);
    }
  };

  const handleSubmitEvidence = async (e) => {
    e.preventDefault();

    if (!evidenceFile) {
      showToast('Please attach a photo showing the completed rescue.', 'warning');
      return;
    }

    setIsActing(true);

    try {
      const evidenceImageUrl = await uploadImageToCloudinary(evidenceFile);

      await API.put(`/cases/${id}/complete`, {
        evidenceImageUrl,
        notes: evidenceNotes.trim() || undefined,
      });

      showToast('Evidence submitted — awaiting verification.', 'success');
      setShowEvidenceForm(false);
      await fetchCase();
    } catch (err) {
      showToast(
        err.response?.data?.error || err.message || 'Failed to submit evidence.',
        'error'
      );
    } finally {
      setIsActing(false);
    }
  };

  const handleVerify = async (approved) => {
    if (!approved && !rejectionReason.trim()) {
      setShowRejectForm(true);
      return;
    }

    setIsActing(true);

    try {
      await API.put(`/cases/${id}/verify-completion`, {
        approved,
        reason: approved ? undefined : rejectionReason.trim(),
      });

      showToast(
        approved ? 'Rescue verified and resolved.' : 'Sent back to the volunteer for more work.',
        'success'
      );

      setShowRejectForm(false);
      setRejectionReason('');
      await fetchCase();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to record verification.', 'error');
    } finally {
      setIsActing(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Cancel this case? This cannot be undone.')) return;

    setIsActing(true);

    try {
      await API.put(`/cases/${id}/cancel`, { reason: 'Cancelled by ' + role.toLowerCase() });
      showToast('Case cancelled.', 'success');
      await fetchCase();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to cancel case.', 'error');
    } finally {
      setIsActing(false);
    }
  };

  const handlePriorityChange = async (priority) => {
    setIsActing(true);

    try {
      await API.put(`/cases/${id}/priority`, { priority });
      showToast(`Priority set to ${priority}.`, 'success');
      await fetchCase();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update priority.', 'error');
    } finally {
      setIsActing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto mb-20">
        <CaseCardSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto mb-20 text-center">
        <p className="text-rose-500 font-bold mb-4">{error || 'Case not found.'}</p>
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Go Back
        </Button>
      </div>
    );
  }

  const { case: caseItem, history } = data;

  const isAssignedToMe = caseItem.assigned_volunteer_id === user?.id;
  const isReporterMe = caseItem.reporter_id === user?.id;

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto mb-20 md:mb-0">

      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 text-sm font-bold text-slate-500 dark:text-slate-400"
      >
        ← Back
      </button>

      <Surface className="p-5 mb-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">
              {caseItem.species || 'Animal Rescue Case'}
            </h1>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              CASE-{caseItem.id} • Reported {new Date(caseItem.created_at).toLocaleDateString()}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={caseItem.status} />
            <PriorityBadge priority={caseItem.priority} />
          </div>
        </div>

        {caseItem.image_payload && (
          <img
            src={caseItem.image_payload}
            alt="Reported animal"
            className="w-full h-56 object-cover rounded-xl mb-4"
          />
        )}

        {caseItem.issue_description && (
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
            {caseItem.issue_description}
          </p>
        )}

        {caseItem.manual_address && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            📍 {caseItem.manual_address}
          </p>
        )}

        {caseItem.evidence_image_payload && (
          <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-slate-700/40">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
              Rescue Evidence
            </p>
            <img
              src={caseItem.evidence_image_payload}
              alt="Rescue evidence"
              className="w-full h-48 object-cover rounded-xl"
            />
            {caseItem.evidence_notes && (
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
                {caseItem.evidence_notes}
              </p>
            )}
          </div>
        )}

        {caseItem.rejection_reason && caseItem.status === 'IN_PROGRESS' && (
          <div className="mt-4 p-3 rounded-xl text-sm bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400">
            <strong>Sent back for more work:</strong> {caseItem.rejection_reason}
          </div>
        )}
      </Surface>

      {/* ROLE-SPECIFIC ACTIONS */}
      <Surface className="p-5 mb-5 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Actions
        </p>

        {/* VOLUNTEER: claim */}
        {role === 'VOLUNTEER' &&
          caseItem.status === 'VALIDATION_PASSED' &&
          !caseItem.assigned_volunteer_id && (
            <Button onClick={handleClaim} disabled={isActing} className="w-full">
              Claim This Case
            </Button>
          )}

        {/* VOLUNTEER/ADMIN: submit evidence */}
        {(role === 'VOLUNTEER' || role === 'ADMIN') &&
          caseItem.status === 'IN_PROGRESS' &&
          (role === 'ADMIN' || isAssignedToMe) && (
            <>
              {!showEvidenceForm ? (
                <Button onClick={() => setShowEvidenceForm(true)} className="w-full">
                  Submit Rescue Evidence
                </Button>
              ) : (
                <form onSubmit={handleSubmitEvidence} className="space-y-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-slate-600 dark:text-slate-300"
                  />
                  <textarea
                    value={evidenceNotes}
                    onChange={(e) => setEvidenceNotes(e.target.value)}
                    placeholder="Notes about the rescue (optional)"
                    rows={3}
                    className="w-full p-3 rounded-xl text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                  />
                  <div className="flex gap-2">
                    <Button type="submit" disabled={isActing} className="flex-1">
                      Submit
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowEvidenceForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}

        {/* VOLUNTEER/ADMIN: cancel */}
        {(role === 'VOLUNTEER' || role === 'ADMIN') &&
          ['VALIDATION_PASSED', 'IN_PROGRESS'].includes(caseItem.status) &&
          (role === 'ADMIN' || isAssignedToMe) && (
            <Button variant="outline" onClick={handleCancel} disabled={isActing} className="w-full">
              Cancel Case
            </Button>
          )}

        {/* NGO/ADMIN: verify completion */}
        {(role === 'NGO' || role === 'ADMIN') &&
          caseItem.status === 'RESCUE_COMPLETED' && (
            <>
              {!showRejectForm ? (
                <div className="flex gap-2">
                  <Button onClick={() => handleVerify(true)} disabled={isActing} className="flex-1">
                    Verify & Resolve
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowRejectForm(true)}
                    disabled={isActing}
                    className="flex-1"
                  >
                    Send Back
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Why is this being sent back?"
                    rows={2}
                    className="w-full p-3 rounded-xl text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      onClick={() => handleVerify(false)}
                      disabled={isActing || !rejectionReason.trim()}
                      className="flex-1"
                    >
                      Confirm Send Back
                    </Button>
                    <Button variant="secondary" onClick={() => setShowRejectForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

        {/* NGO/ADMIN: priority */}
        {(role === 'NGO' || role === 'ADMIN') && (
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">Priority</p>
            <div className="flex gap-1.5">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={isActing}
                  onClick={() => handlePriorityChange(p)}
                  className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all ${
                    (caseItem.priority || 'STANDARD') === p
                      ? 'bg-[#1a1f2e] dark:bg-black text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ADMIN: cancel from any active state */}
        {role === 'ADMIN' &&
          !['VALIDATION_PASSED', 'IN_PROGRESS'].includes(caseItem.status) &&
          !['RESOLVED', 'CANCELLED'].includes(caseItem.status) && (
            <Button variant="outline" onClick={handleCancel} disabled={isActing} className="w-full">
              Cancel Case
            </Button>
          )}

        {/* USER: nothing to do but track */}
        {role === 'USER' && isReporterMe && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            You'll see updates here as this case moves through verification and rescue.
          </p>
        )}

        {/* Fallback: no actions available for this role/state */}
        {role === 'VOLUNTEER' &&
          caseItem.status === 'VALIDATION_PASSED' &&
          caseItem.assigned_volunteer_id &&
          !isAssignedToMe && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              This case has already been claimed by another volunteer.
            </p>
          )}
      </Surface>

      {/* TIMELINE */}
      <Surface className="p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">
          Timeline
        </p>
        <CaseTimeline caseItem={caseItem} history={history} />
      </Surface>

      <div className="mt-4 text-center">
        <Link to="/map" className="text-xs font-bold text-blue-600 dark:text-blue-400">
          View on Map →
        </Link>
      </div>

    </div>
  );
}
