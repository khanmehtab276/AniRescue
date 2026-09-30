import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing, CheckCheck, ChevronRight, Inbox } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import API from "../utils/api";
import { useAuth } from "../contexts/AuthContext.jsx";

const TYPE_META = {
  CASE_AVAILABLE: { label: "Nearby rescue", tone: "amber" },
  CASE_CLAIMED: { label: "Case claimed", tone: "emerald" },
  CASE_ASSIGNED: { label: "Case assigned", tone: "sky" },
  COMPLETION_VERIFIED: { label: "Rescue verified", tone: "emerald" },
  COMPLETION_REJECTED: { label: "Verification update", tone: "rose" },
  VALIDATION_PASSED: { label: "AI validation", tone: "emerald" },
  VALIDATION_REJECTED: { label: "AI review", tone: "rose" },
  EVIDENCE_SUBMITTED: { label: "Rescue update", tone: "sky" },
  CASE_RESOLVED: { label: "Case resolved", tone: "emerald" },
  CASE_RELEASED: { label: "Case released", tone: "amber" },
  CASE_CANCELLED: { label: "Case cancelled", tone: "rose" },
};

function relativeTime(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const ranges = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of ranges) {
    if (Math.abs(seconds) >= size) {
      return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
        Math.round(seconds / size),
        unit,
      );
    }
  }
  return "Just now";
}

function toneClasses(tone) {
  return {
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  }[tone] || "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300";
}

export function notificationMeta(type) {
  return TYPE_META[type] || { label: "AniRescue update", tone: "emerald" };
}

export function formatNotificationTime(value) {
  return relativeTime(value);
}

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data } = await API.get("/notifications?limit=20");
      setItems(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(Number(data.unreadCount) || 0);
    } catch {
      // Notification UI should never block the rest of the application.
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 45000);
    const handleUpdate = () => load();
    window.addEventListener("anirescue:notifications-updated", handleUpdate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("anirescue:notifications-updated", handleUpdate);
    };
  }, [load]);

  useEffect(() => {
    const handlePointer = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointer);
    return () => document.removeEventListener("pointerdown", handlePointer);
  }, []);

  const markRead = async (item) => {
    if (!item.is_read) {
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, is_read: true } : entry,
        ),
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      try {
        await API.patch(`/notifications/${item.id}/read`);
      } catch {
        load();
      }
    }
  };

  const openNotification = async (item) => {
    await markRead(item);
    setOpen(false);
    if (item.case_id) navigate(`/cases/${item.case_id}`);
  };

  if (!user) return null;

  const latest = items.slice(0, 5);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-stone-200 bg-white text-stone-500 transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:text-emerald-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400 dark:hover:border-emerald-700 dark:hover:text-emerald-400"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {unreadCount > 0 ? <BellRing size={17} /> : <Bell size={17} />}
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-black leading-4 text-white shadow-sm">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button type="button" aria-label="Close notifications" onClick={() => setOpen(false)} className="fixed inset-0 z-[55] cursor-default bg-stone-950/10 backdrop-blur-md dark:bg-black/20" />
          <div className="fixed right-2 top-[4.5rem] z-[70] w-[calc(100vw-1rem)] max-w-[390px] overflow-hidden rounded-3xl border border-stone-200/80 bg-white/95 shadow-2xl shadow-stone-950/20 ring-1 ring-black/5 animate-rescue-popover dark:border-stone-800 dark:bg-stone-900/95 sm:absolute sm:right-0 sm:top-[3.25rem] sm:w-[min(92vw,390px)]">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-4 dark:border-stone-800">
            <div>
              <p className="text-sm font-black text-stone-900 dark:text-white">Notifications</p>
              <p className="mt-0.5 text-[11px] font-semibold text-stone-400">
                {unreadCount ? `${unreadCount} unread update${unreadCount === 1 ? "" : "s"}` : "You're all caught up"}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await API.patch("/notifications/read-all");
                    setItems((current) => current.map((entry) => ({ ...entry, is_read: true })));
                    setUnreadCount(0);
                  } catch {
                    load();
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-black text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
              >
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[390px] overflow-y-auto p-2">
            {loading && !items.length ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3].map((key) => (
                  <div key={key} className="h-20 animate-pulse rounded-2xl bg-stone-100 dark:bg-stone-800" />
                ))}
              </div>
            ) : latest.length ? (
              latest.map((item) => {
                const meta = notificationMeta(item.notification_type);
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => openNotification(item)}
                    className={`flex w-full gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-stone-50 dark:hover:bg-stone-800/80 ${item.is_read ? "" : "bg-emerald-50/60 dark:bg-emerald-950/10"}`}
                  >
                    <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${toneClasses(meta.tone)}`}>
                      <Bell size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-xs font-black text-stone-800 dark:text-stone-100">{item.title}</span>
                        {!item.is_read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-label="Unread" />}
                      </span>
                      <span className="mt-1 block text-[11px] leading-5 text-stone-500 dark:text-stone-400">{item.message}</span>
                      <span className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-stone-400">
                        {relativeTime(item.created_at)}
                        {item.case_id && <>· Case #{item.case_id}</>}
                      </span>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="px-5 py-10 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-stone-100 text-stone-400 dark:bg-stone-800"><Inbox size={20} /></span>
                <p className="mt-3 text-sm font-black text-stone-700 dark:text-stone-200">No notifications yet</p>
                <p className="mt-1 text-xs leading-5 text-stone-400">Rescue assignments and case updates will appear here.</p>
              </div>
            )}
          </div>

          <div className="border-t border-stone-100 p-2 dark:border-stone-800">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-black text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
            >
              View all notifications <ChevronRight size={15} />
            </Link>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
