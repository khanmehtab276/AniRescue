import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import API from "../utils/api";
import Surface from "../components/ui/Surface.jsx";
import Button from "../components/ui/Button.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import { formatNotificationTime, notificationMeta } from "../components/NotificationBell.jsx";

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await API.get("/notifications?limit=100");
      setItems(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(Number(data.unreadCount) || 0);
    } catch (err) {
      setError(err.response?.data?.error || "We could not load your notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () => (filter === "unread" ? items.filter((item) => !item.is_read) : items),
    [items, filter],
  );

  const markRead = async (id) => {
    await API.patch(`/notifications/${id}/read`);
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, is_read: true } : item)),
    );
    setUnreadCount((count) => Math.max(0, count - 1));
  };

  const markAllRead = async () => {
    if (!unreadCount) return;
    await API.patch("/notifications/read-all");
    setItems((current) => current.map((item) => ({ ...item, is_read: true })));
    setUnreadCount(0);
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-stone-900 to-slate-950 p-6 text-white sm:p-9">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-emerald-300">
              <Bell size={17} />
              <span className="text-xs font-black uppercase tracking-[0.18em]">Updates</span>
            </div>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">Notifications</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-stone-300">
              Important rescue assignments, nearby cases, and verification updates in one place.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={load}
              className="grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-white/10 text-stone-200 hover:bg-white/15"
              aria-label="Refresh notifications"
            >
              <RefreshCw size={16} />
            </button>
            {unreadCount > 0 && (
              <Button onClick={markAllRead} className="bg-white text-stone-900 hover:bg-stone-100">
                <CheckCheck size={16} /> Mark all read
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="mt-5 flex items-center gap-2">
        {[
          ["all", `All ${items.length}`],
          ["unread", `Unread ${unreadCount}`],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-xl px-3.5 py-2 text-xs font-black transition-colors ${filter === value ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-900 dark:text-stone-400 dark:hover:bg-stone-800"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="mt-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((key) => <div key={key} className="h-28 animate-pulse rounded-2xl bg-stone-100 dark:bg-stone-900" />)}
          </div>
        ) : error ? (
          <Surface className="p-10">
            <EmptyState icon="⚠️" title="Could not load notifications" message={error}>
              <Button onClick={load}>Try again</Button>
            </EmptyState>
          </Surface>
        ) : visible.length ? (
          <div className="space-y-3">
            {visible.map((item) => {
              const meta = notificationMeta(item.notification_type);
              return (
                <Surface key={item.id} className={`border p-4 sm:p-5 ${item.is_read ? "" : "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/10"}`}>
                  <div className="flex gap-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                      <Bell size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">{meta.label}</p>
                          <h2 className="mt-0.5 text-base font-black text-stone-900 dark:text-white">{item.title}</h2>
                        </div>
                        {!item.is_read && <span className="rounded-full bg-emerald-500 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white">Unread</span>}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-300">{item.message}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] font-bold text-stone-400">
                        <span>{formatNotificationTime(item.created_at)}</span>
                        {item.case_id && <Link to={`/cases/${item.case_id}`} className="text-emerald-600 hover:underline dark:text-emerald-400">Open Case #{item.case_id}</Link>}
                        {!item.is_read && (
                          <button type="button" onClick={() => markRead(item.id)} className="inline-flex items-center gap-1 text-stone-500 hover:text-emerald-600 dark:text-stone-400 dark:hover:text-emerald-400">
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </Surface>
              );
            })}
          </div>
        ) : (
          <Surface className="p-10">
            <EmptyState icon="🔔" title={filter === "unread" ? "No unread notifications" : "No notifications yet"} message="Rescue updates will appear here when there is something important to act on." />
          </Surface>
        )}
      </section>
    </main>
  );
}
