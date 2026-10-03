import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, X, Brain, ShieldAlert, Stethoscope, ListChecks } from 'lucide-react';
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
  const [confirmAction, setConfirmAction] = useState(null);

  // Evidence submission form (volunteer)
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);

  // Dispatch (NGO/ADMIN): nearby-volunteer lookup for the assign action
  const [nearby, setNearby] = useState(null);
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);

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

  const handleRelease = async () => {
    setConfirmAction({ kind: 'release', title: 'Release this case?', message: 'The case will return to the available rescue pool for another volunteer.' });
  };

  const confirmRelease = async () => {
    setConfirmAction(null);
    setIsActing(true);

    try {
      await API.put(`/cases/${id}/release`);
      showToast('Case released back to the available pool.', 'success');
      await fetchCase();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to release case.', 'error');
    } finally {
      setIsActing(false);
    }
  };

  const loadNearbyVolunteers = async () => {
    setIsLoadingNearby(true);

    try {
      const { data } = await API.get(`/cases/${id}/nearby-volunteers`);
      setNearby({
        volunteers: Array.isArray(data.volunteers) ? data.volunteers : [],
        radiusKm: data.searchRadiusKm,
      });
    } catch (err) {
      showToast(
        err.response?.data?.error || 'Unable to look up nearby volunteers.',
        'error'
      );
    } finally {
      setIsLoadingNearby(false);
    }
  };

  const handleAssign = async (volunteer) => {
    setConfirmAction({ kind: 'assign', volunteer, title: 'Assign this rescue?', message: `${volunteer.full_name || 'This volunteer'} will receive the rescue assignment and notification.` });
  };

  const confirmAssign = async (volunteer) => {
    setConfirmAction(null);
    setIsActing(true);

    try {
      await API.put(`/cases/${id}/assign`, { volunteerId: volunteer.id });
      showToast('Volunteer assigned. They have been notified.', 'success');
      setNearby(null);
      await fetchCase();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to assign volunteer.', 'error');
    } finally {
      setIsActing(false);
    }
  };

  const handleCancel = async () => {
    setConfirmAction({ kind: 'cancel', title: 'Cancel this case?', message: 'This will stop the current rescue workflow. You can’t undo this action.' });
  };

  const confirmCancel = async () => {
    setConfirmAction(null);
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

  const runConfirmAction = () => {
    if (confirmAction?.kind === 'release') return confirmRelease();
    if (confirmAction?.kind === 'cancel') return confirmCancel();
    if (confirmAction?.kind === 'assign') return confirmAssign(confirmAction.volunteer);
    return undefined;
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-10 lg:pb-10">
        <CaseCardSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto mb-20 text-center">
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
    <>
      {confirmAction && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-stone-950/35 p-3 backdrop-blur-md sm:items-center sm:p-6" role="presentation" onMouseDown={() => setConfirmAction(null)}>
          <div className="w-full max-w-md animate-rescue-pop rounded-3xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-800 dark:bg-stone-900" role="dialog" aria-modal="true" aria-labelledby="confirm-action-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300"><AlertTriangle size={20} /></span>
              <div className="min-w-0">
                <h2 id="confirm-action-title" className="text-lg font-black text-stone-900 dark:text-white">{confirmAction.title}</h2>
                <p className="mt-1 text-sm leading-6 text-stone-500 dark:text-stone-400">{confirmAction.message}</p>
              </div>
              <button type="button" onClick={() => setConfirmAction(null)} className="rescue-focus-ring ml-auto rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Close confirmation"><X size={17} /></button>
            </div>
            <div className="mt-5 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmAction(null)}>Not now</Button>
              <Button variant={confirmAction.kind === 'cancel' ? 'danger' : 'primary'} className="flex-1" onClick={runConfirmAction}>Continue</Button>
            </div>
          </div>
        </div>
      )}
    <div className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-10 lg:pb-10">

      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 text-sm font-bold text-stone-500 dark:text-stone-400"
      >
        ← Back
      </button>

      <Surface className="mb-6 overflow-hidden p-5 sm:p-7">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h1 className="text-xl font-black text-stone-800 dark:text-stone-100">
              {caseItem.species || 'Animal Rescue Case'}
            </h1>
            <p className="text-xs font-bold text-stone-500 dark:text-stone-400">
              CASE-{caseItem.id} • Reported {new Date(caseItem.created_at).toLocaleDateString()}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={caseItem.status} friendly={role === 'USER'} />
            {role !== 'USER' && <PriorityBadge priority={caseItem.priority} />}
          </div>
        </div>

        {caseItem.image_payload && (
          <img
            src={caseItem.image_payload}
            alt="Reported animal" onError={(event) => { event.currentTarget.hidden = true; }}
            className="w-full max-h-[70vh] h-auto object-contain rounded-xl mb-4 rescue-image-fade bg-stone-100 dark:bg-stone-950"
          />
        )}

        {caseItem.issue_description && (
          <p className="text-sm text-stone-600 dark:text-stone-300 mb-3">
            {caseItem.issue_description}
          </p>
        )}

        {caseItem.manual_address && (
          <p className="text-xs text-stone-500 dark:text-stone-400">
            📍 {caseItem.manual_address}
          </p>
        )}

        {caseItem.evidence_image_payload && (
          <div className="mt-4 pt-4 border-t border-stone-200/60 dark:border-stone-700/40">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-2">
              Rescue Evidence
            </p>
            <img
              src={caseItem.evidence_image_payload}
              alt="Rescue evidence" onError={(event) => { event.currentTarget.hidden = true; }}
              className="w-full max-h-[60vh] h-auto object-contain rounded-xl rescue-image-fade bg-stone-100 dark:bg-stone-950"
            />
            {caseItem.evidence_notes && (
              <p className="text-sm text-stone-600 dark:text-stone-300 mt-2">
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

      {/* AI PRELIMINARY ASSESSMENT */}
      {caseItem.gemini_status === 'COMPLETED' && caseItem.gemini_analysis && (
        <Surface className="mb-6 overflow-hidden p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
              <Brain size={21} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-300">AI Preliminary Assessment</p>
              <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
                Visual triage guidance only — not a medical diagnosis.
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-stone-100/80 p-3 dark:bg-stone-800/70">
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">Severity</p>
              <p className="mt-1 text-sm font-black text-stone-800 dark:text-stone-100">{caseItem.gemini_analysis.severity || 'UNKNOWN'}</p>
            </div>
            <div className="rounded-2xl bg-stone-100/80 p-3 dark:bg-stone-800/70">
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">Urgency</p>
              <p className="mt-1 text-sm font-black text-stone-800 dark:text-stone-100">{caseItem.gemini_analysis.urgency || 'UNKNOWN'}</p>
            </div>
            <div className="rounded-2xl bg-stone-100/80 p-3 dark:bg-stone-800/70 col-span-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">Condition</p>
              <p className="mt-1 text-sm font-semibold leading-5 text-stone-700 dark:text-stone-200">{caseItem.gemini_analysis.condition_summary || 'No visual condition summary available.'}</p>
            </div>
          </div>

          {Array.isArray(caseItem.gemini_analysis.visible_signs) && caseItem.gemini_analysis.visible_signs.length > 0 && (
            <div className="mt-4 rounded-2xl border border-stone-200/70 p-4 dark:border-stone-700/60">
              <div className="flex items-center gap-2 text-sm font-black text-stone-800 dark:text-stone-100">
                <ShieldAlert size={17} /> Visible signs
              </div>
              <ul className="mt-2 space-y-1.5 text-sm text-stone-600 dark:text-stone-300">
                {caseItem.gemini_analysis.visible_signs.map((sign, index) => <li key={index}>• {sign}</li>)}
              </ul>
            </div>
          )}

          {Array.isArray(caseItem.gemini_analysis.first_aid) && caseItem.gemini_analysis.first_aid.length > 0 && (
            <div className="mt-4 rounded-2xl border border-stone-200/70 p-4 dark:border-stone-700/60">
              <div className="flex items-center gap-2 text-sm font-black text-stone-800 dark:text-stone-100">
                <Stethoscope size={17} /> Immediate care guidance
              </div>
              <ul className="mt-2 space-y-1.5 text-sm text-stone-600 dark:text-stone-300">
                {caseItem.gemini_analysis.first_aid.map((item, index) => <li key={index}>• {item}</li>)}
              </ul>
            </div>
          )}

          {role !== 'USER' && caseItem.gemini_analysis.recommended_action && (
            <div className="mt-4 rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/30">
              <div className="flex items-center gap-2 text-sm font-black text-emerald-700 dark:text-emerald-300">
                <ListChecks size={17} /> Rescue team next step
              </div>
              <p className="mt-2 text-sm leading-6 text-stone-700 dark:text-stone-200">
                {caseItem.gemini_analysis.recommended_action}
              </p>
            </div>
          )}

          {role === 'USER' && isReporterMe && (
            <div className="mt-4 rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/30">
              <p className="text-sm font-black text-emerald-700 dark:text-emerald-300">Your report is already in the rescue workflow.</p>
              <p className="mt-1 text-sm leading-6 text-stone-600 dark:text-stone-300">
                The AniRescue rescue team will review the case, coordinate the rescue, and arrange further care when needed. You do not need to contact another rescue organization for this report.
              </p>
            </div>
          )}
        </Surface>
      )}

      {/* ROLE-SPECIFIC ACTIONS */}
      <Surface className="mb-6 p-5 sm:p-6 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
          Actions
        </p>

        {/* VOLUNTEER / NGO / ADMIN: claim (backend enforces NGO jurisdiction) */}
        {['VOLUNTEER', 'NGO', 'ADMIN'].includes(role) &&
          caseItem.status === 'VALIDATION_PASSED' &&
          !caseItem.assigned_volunteer_id && (
            <Button onClick={handleClaim} disabled={isActing} className="w-full">
              Claim This Case
            </Button>
          )}

        {/* NGO / ADMIN: dispatch to a specific volunteer */}
        {(role === 'NGO' || role === 'ADMIN') &&
          caseItem.status === 'VALIDATION_PASSED' &&
          !caseItem.assigned_volunteer_id && (
            <div className="space-y-2">
              <Button
                variant="secondary"
                onClick={loadNearbyVolunteers}
                disabled={isLoadingNearby || isActing}
                className="w-full"
              >
                {isLoadingNearby ? 'Searching...' : 'Assign a Volunteer'}
              </Button>

              {nearby && (
                nearby.volunteers.length === 0 ? (
                  <p className="text-sm text-stone-500 dark:text-stone-400">
                    No available volunteers with a recent location were found within {nearby.radiusKm} km
                    {role === 'NGO' ? ' on your volunteer roster' : ''}.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {nearby.volunteers.map((volunteer) => (
                      <li
                        key={volunteer.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl bg-stone-100 dark:bg-stone-800"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-stone-800 dark:text-stone-100 truncate">
                            {volunteer.full_name || 'Volunteer'}
                          </p>
                          <p className="text-xs text-stone-500 dark:text-stone-400">
                            {Number(volunteer.distance_km).toFixed(1)} km away
                          </p>
                        </div>

                        <Button
                          size="sm"
                          onClick={() => handleAssign(volunteer)}
                          disabled={isActing}
                        >
                          Assign
                        </Button>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          )}

        {/* VOLUNTEER: hand a claimed case back */}
        {role === 'VOLUNTEER' &&
          caseItem.status === 'IN_PROGRESS' &&
          isAssignedToMe && (
            <Button variant="outline" onClick={handleRelease} disabled={isActing} className="w-full">
              Release This Case
            </Button>
          )}

        {/* VOLUNTEER/ADMIN: submit evidence */}
        {['VOLUNTEER', 'NGO', 'ADMIN'].includes(role) &&
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
                    className="w-full text-sm text-stone-600 dark:text-stone-300"
                  />
                  <textarea
                    value={evidenceNotes}
                    onChange={(e) => setEvidenceNotes(e.target.value)}
                    placeholder="Notes about the rescue (optional)"
                    rows={3}
                    className="w-full p-3 rounded-xl text-sm bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200"
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
                    className="w-full p-3 rounded-xl text-sm bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200"
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
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <p className="text-xs text-stone-500 dark:text-stone-400">Rescue Priority</p>
              {caseItem.gemini_status === 'COMPLETED' && (
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-300">AI-derived initially</span>
              )}
            </div>
            <p className="mb-2 text-[11px] leading-4 text-stone-400 dark:text-stone-500">
              Initially derived from AI severity/urgency; NGO or Admin can adjust it for the operational rescue queue.
            </p>
            <div className="flex gap-1.5">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={isActing}
                  onClick={() => handlePriorityChange(p)}
                  className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all ${
                    (caseItem.priority || 'STANDARD') === p
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
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
          !['RESOLVED', 'CANCELLED'].includes(caseItem.status) && (
            <Button variant="outline" onClick={handleCancel} disabled={isActing} className="w-full">
              Cancel Case
            </Button>
          )}

        {/* USER: nothing to do but track */}
        {role === 'USER' && isReporterMe && (
          <p className="text-sm text-stone-500 dark:text-stone-400">
            You'll see updates here as this case moves through verification and rescue.
          </p>
        )}

        {/* Fallback: no actions available for this role/state */}
        {role === 'VOLUNTEER' &&
          caseItem.status === 'VALIDATION_PASSED' &&
          caseItem.assigned_volunteer_id &&
          !isAssignedToMe && (
            <p className="text-sm text-stone-500 dark:text-stone-400">
              This case has already been claimed by another volunteer.
            </p>
          )}
      </Surface>

      {/* TIMELINE */}
      <Surface className="p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-4">
          Timeline
        </p>
        <CaseTimeline caseItem={caseItem} history={history} friendly={role === 'USER'} />
      </Surface>

      <div className="mt-4 text-center">
        <Link to="/map" className="text-xs font-bold text-blue-600 dark:text-blue-400">
          View on Map →
        </Link>
      </div>

    </div>
    </>
  );
}
