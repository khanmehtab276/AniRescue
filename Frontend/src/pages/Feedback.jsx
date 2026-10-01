import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, MessageSquareHeart, RefreshCw, Send, ShieldCheck, Star } from "lucide-react";
import API from "../utils/api";
import { useAuth } from "../contexts/AuthContext.jsx";

const CATEGORIES = [
  ["PLATFORM", "Platform experience", "Tell us how AniRescue feels to use overall."],
  ["RESCUE_EXPERIENCE", "Rescue experience", "Share feedback about reporting, tracking or rescue flow."],
  ["VOLUNTEER_EXPERIENCE", "Volunteer experience", "Share feedback about volunteer coordination."],
  ["NGO_EXPERIENCE", "NGO experience", "Share feedback about NGO operations and coordination."],
  ["SUGGESTION", "Suggestion", "Suggest a feature or improvement."],
  ["OTHER", "Something else", "Anything important that does not fit the options above."],
];

const ROLE_LABELS = { USER: "Reporter", VOLUNTEER: "Volunteer", NGO: "NGO", ADMIN: "Administrator" };
const ROLE_TONES = {
  USER: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
  VOLUNTEER: "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300",
  NGO: "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300",
  ADMIN: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
};

function Rating({ value, onChange, disabled }) {
  return (
    <div className="flex gap-2" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= value;
        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            onClick={() => onChange(star)}
            className={"grid h-11 w-11 place-items-center rounded-xl border transition-all " + (
              active
                ? "border-amber-300 bg-amber-50 text-amber-500 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                : "border-stone-200 bg-white text-stone-300 hover:-translate-y-0.5 hover:border-amber-200 hover:text-amber-400 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-600"
            )}
            aria-label={star + " out of 5"}
            aria-checked={value === star}
            role="radio"
          >
            <Star size={19} fill={active ? "currentColor" : "none"} />
          </button>
        );
      })}
    </div>
  );
}

function FeedbackCard({ item, admin = false }) {
  const role = String(item.user_role || "").toUpperCase();
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-stone-900 dark:text-white">
            {admin ? item.user_name || "AniRescue user" : "Your feedback"}
          </p>
          {admin && item.user_email && <p className="mt-1 truncate text-[11px] text-stone-400">{item.user_email}</p>}
        </div>
        <div className="flex shrink-0 text-amber-500">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star key={star} size={14} fill={star <= item.rating ? "currentColor" : "none"} />
          ))}
        </div>
      </div>

      {admin && role && (
        <span className={"mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider " + (ROLE_TONES[role] || ROLE_TONES.USER)}>
          {ROLE_LABELS[role] || role}
        </span>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-stone-600 dark:bg-stone-800 dark:text-stone-300">
          {String(item.category || "PLATFORM").replaceAll("_", " ")}
        </span>
        {item.case_id && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">Case #{item.case_id}</span>}
      </div>

      <p className="mt-3 text-sm leading-6 text-stone-600 dark:text-stone-300">{item.message}</p>
      <p className="mt-3 text-[10px] font-semibold text-stone-400">{new Date(item.created_at).toLocaleString()}</p>
    </article>
  );
}

export default function Feedback() {
  const { user } = useAuth();
  const role = String(user?.role || "USER").toUpperCase();
  const isAdmin = role === "ADMIN";
  const [category, setCategory] = useState("PLATFORM");
  const [rating, setRating] = useState(5);
  const [message, setMessage] = useState("");
  const [caseId, setCaseId] = useState("");
  const [history, setHistory] = useState([]);
  const [adminFeedback, setAdminFeedback] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);

  const selected = useMemo(
    () => CATEGORIES.find((item) => item[0] === category) || CATEGORIES[0],
    [category],
  );

  const loadMine = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const { data } = await API.get("/feedback/mine");
      setHistory(Array.isArray(data.feedback) ? data.feedback : []);
    } catch (error) {
      console.error("Feedback history load failed:", error);
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const loadAdmin = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingAdmin(true);
    try {
      const { data } = await API.get("/feedback");
      setAdminFeedback(Array.isArray(data.feedback) ? data.feedback : []);
    } catch (error) {
      console.error("Admin feedback load failed:", error);
      setAdminFeedback([]);
    } finally {
      setLoadingAdmin(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadMine();
    loadAdmin();
  }, [loadMine, loadAdmin]);

  const submit = async (event) => {
    event.preventDefault();
    const trimmed = message.trim();

    if (trimmed.length < 10) {
      setNotice({ type: "error", text: "Please write at least 10 characters so your feedback is useful." });
      return;
    }

    setSubmitting(true);
    setNotice(null);

    try {
      await API.post("/feedback", {
        category,
        rating,
        message: trimmed,
        caseId: caseId.trim() ? Number(caseId) : null,
      });
      setMessage("");
      setCaseId("");
      setRating(5);
      setCategory("PLATFORM");
      setNotice({ type: "success", text: "Thank you. Your feedback has been submitted." });
      await Promise.all([loadMine(), loadAdmin()]);
    } catch (error) {
      setNotice({ type: "error", text: error?.response?.data?.error || "Feedback could not be submitted right now." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-[75vh] px-4 pb-24 sm:px-6 lg:px-8 lg:pb-10">
      <div className="mx-auto max-w-5xl py-6 lg:py-10">
        <section className="relative overflow-hidden rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-8">
          <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="relative flex items-center gap-5">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300">
              <MessageSquareHeart size={30} strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">Help us improve</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-stone-900 dark:text-white">Share your AniRescue experience</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500 dark:text-stone-400">
                Your feedback helps improve reporting, rescue coordination and the experience for every role.
              </p>
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <form onSubmit={submit} className="rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-stone-400">Your feedback</p>
                <h2 className="mt-1 text-xl font-black text-stone-900 dark:text-white">How was your experience?</h2>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300"><ShieldCheck size={18} /></span>
            </div>

            <div className="mt-7">
              <label className="text-xs font-black uppercase tracking-wider text-stone-500 dark:text-stone-400">Rating</label>
              <div className="mt-3"><Rating value={rating} onChange={setRating} disabled={submitting} /></div>
              <p className="mt-2 text-xs font-semibold text-stone-400">{rating}/5</p>
            </div>

            <div className="mt-6">
              <label htmlFor="feedback-category" className="text-xs font-black uppercase tracking-wider text-stone-500 dark:text-stone-400">What is your feedback about?</label>
              <div className="relative mt-2">
                <select id="feedback-category" value={category} onChange={(event) => setCategory(event.target.value)} disabled={submitting}
                  className="w-full appearance-none rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3.5 pr-11 text-sm font-bold text-stone-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100">
                  {CATEGORIES.map((item) => <option key={item[0]} value={item[0]}>{item[1]}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-stone-400" size={17} />
              </div>
              <p className="mt-2 text-xs text-stone-400">{selected[2]}</p>
            </div>

            <div className="mt-6">
              <label htmlFor="feedback-message" className="text-xs font-black uppercase tracking-wider text-stone-500 dark:text-stone-400">Tell us more</label>
              <textarea id="feedback-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} rows={6} disabled={submitting}
                placeholder="What worked well? What should we improve?"
                className="mt-2 w-full resize-y rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3.5 text-sm leading-6 text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100" />
              <div className="mt-2 flex justify-end text-[10px] font-bold text-stone-400">{message.length}/2000</div>
            </div>

            <div className="mt-5">
              <label htmlFor="feedback-case" className="text-xs font-black uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Related case <span className="font-semibold normal-case tracking-normal text-stone-400">(optional)</span>
              </label>
              <input id="feedback-case" inputMode="numeric" value={caseId} onChange={(event) => setCaseId(event.target.value.replace(/[^0-9]/g, ""))} placeholder="e.g. 42" disabled={submitting}
                className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3.5 text-sm font-semibold text-stone-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100" />
              <p className="mt-2 text-xs text-stone-400">The backend checks that your role is allowed to attach feedback to the case.</p>
            </div>

            {notice && (
              <div role="status" className={"mt-5 flex items-start gap-3 rounded-2xl border p-4 text-sm font-semibold " + (
                notice.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300"
                  : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300"
              )}>
                {notice.type === "success" ? <CheckCircle2 size={18} /> : <MessageSquareHeart size={18} />}
                <span>{notice.text}</span>
              </div>
            )}

            <button type="submit" disabled={submitting}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-emerald-600/20 transition-all hover:-translate-y-0.5 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? <RefreshCw size={17} className="animate-spin" /> : <Send size={17} />}
              {submitting ? "Submitting..." : "Send feedback"}
            </button>
          </form>

          <section className="rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs font-black uppercase tracking-wider text-stone-400">Your history</p><h2 className="mt-1 text-xl font-black text-stone-900 dark:text-white">Previous feedback</h2></div>
              <button type="button" onClick={loadMine} disabled={loadingHistory} className="grid h-9 w-9 place-items-center rounded-xl border border-stone-200 text-stone-400 transition hover:text-emerald-600 dark:border-stone-800 dark:hover:text-emerald-400" aria-label="Refresh feedback history">
                <RefreshCw size={15} className={loadingHistory ? "animate-spin" : ""} />
              </button>
            </div>
            <div className="mt-5 space-y-3">
              {loadingHistory ? [1, 2].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-stone-100 dark:bg-stone-800" />)
                : history.length ? history.map((item) => <FeedbackCard key={item.id} item={item} />)
                : <div className="rounded-2xl border border-dashed border-stone-200 p-7 text-center dark:border-stone-800"><MessageSquareHeart className="mx-auto text-stone-300 dark:text-stone-600" size={26} /><p className="mt-3 text-sm font-black text-stone-700 dark:text-stone-200">No feedback yet</p><p className="mt-1 text-xs text-stone-400">Your submitted feedback will appear here.</p></div>}
            </div>
          </section>
        </div>

        {isAdmin && (
          <section className="mt-8 rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">Administrator view</p><h2 className="mt-1 text-xl font-black text-stone-900 dark:text-white">Platform feedback</h2><p className="mt-1 text-xs text-stone-400">Only active administrators can access the global feedback list.</p></div>
              <button type="button" onClick={loadAdmin} disabled={loadingAdmin} className="grid h-9 w-9 place-items-center rounded-xl border border-stone-200 text-stone-400 transition hover:text-emerald-600 dark:border-stone-800 dark:hover:text-emerald-400" aria-label="Refresh platform feedback"><RefreshCw size={15} className={loadingAdmin ? "animate-spin" : ""} /></button>
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {loadingAdmin ? [1, 2, 3, 4].map((item) => <div key={item} className="h-36 animate-pulse rounded-2xl bg-stone-100 dark:bg-stone-800" />)
                : adminFeedback.length ? adminFeedback.map((item) => <FeedbackCard key={item.id} item={item} admin />)
                : <div className="lg:col-span-2 rounded-2xl border border-dashed border-stone-200 p-7 text-center dark:border-stone-800"><ShieldCheck className="mx-auto text-stone-300 dark:text-stone-600" size={26} /><p className="mt-3 text-sm font-black text-stone-700 dark:text-stone-200">No platform feedback yet</p></div>}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
