import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, PawPrint, RefreshCw, Siren } from "lucide-react";
import API from "../utils/api";
import Surface from "../components/ui/Surface.jsx";
import Button from "../components/ui/Button.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import { CaseListSkeleton } from "../components/ui/LoadingState.jsx";
import { StatusBadge } from "../components/ui/Badge.jsx";

export default function UserCases() {
  const [cases, setCases] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { const { data } = await API.get("/cases/mine"); setCases(Array.isArray(data) ? data : []); }
    catch (err) { setCases([]); setError(err.response?.data?.error || "We could not load your reported cases."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const visible = cases.filter((c) => filter === "ALL" || (filter === "ACTIVE" ? !["RESOLVED","CANCELLED","REJECTED_JUNK"].includes(c.status) : c.status === filter));
  return <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-stone-900 to-stone-950 p-6 text-white sm:p-8">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">My reports</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-black sm:text-4xl">My Rescue Reports</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300">Track every animal report you have submitted from this account.</p></div>
        <Button as={Link} to="/report" className="bg-emerald-500 hover:bg-emerald-400"><Siren size={16}/> Report animal</Button>
      </div>
    </section>
    <div className="mt-6 flex flex-wrap items-center gap-2">
      {["ALL","ACTIVE","RESOLVED","CANCELLED"].map((f) => <button key={f} onClick={() => setFilter(f)} className={"rounded-full px-4 py-2 text-xs font-black " + (filter === f ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : "bg-stone-100 text-stone-500 dark:bg-stone-900")}>{f === "ALL" ? "All" : f === "ACTIVE" ? "Active" : f[0] + f.slice(1).toLowerCase()}</button>)}
      <button onClick={load} className="ml-auto inline-flex items-center gap-2 text-xs font-bold text-stone-500"><RefreshCw size={14}/> Refresh</button>
    </div>
    <div className="mt-5">{loading ? <CaseListSkeleton/> : error ? <Surface className="p-8"><EmptyState icon="⚠️" title="Could not load reports" message={error}><Button onClick={load}>Try again</Button></EmptyState></Surface> : visible.length === 0 ? <Surface className="p-8"><EmptyState icon="🐾" title="No cases here" message="Your submitted rescue reports will appear here."/></Surface> :
      <div className="grid gap-3 sm:grid-cols-2">{visible.map((c) => <Link key={c.id} to={"/cases/" + c.id} className="group rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-emerald-300 hover:shadow-lg dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-start justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600"><PawPrint size={19}/></span><StatusBadge status={c.status} friendly compact/></div>
        <p className="mt-5 text-xs font-black uppercase tracking-wider text-stone-400">Case #{c.id}</p><h2 className="mt-1 text-lg font-black dark:text-white">{c.species || "Animal rescue"}</h2>
        <p className="mt-1 line-clamp-2 text-sm text-stone-500">{c.issue_description || c.manual_address || "Rescue report"}</p>
        <div className="mt-5 flex justify-between text-xs font-bold text-stone-400"><span>{c.created_at ? new Date(c.created_at).toLocaleDateString() : ""}</span><span className="inline-flex items-center gap-1 text-emerald-600">Track <ArrowRight size={14}/></span></div>
      </Link>)}</div>}
    </div>
  </main>;
}
