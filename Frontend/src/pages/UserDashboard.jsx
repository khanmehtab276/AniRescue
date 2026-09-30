import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Clock3, MapPin, PawPrint, Siren, Sparkles } from "lucide-react";
import { useAuth } from "../contexts/AuthContext.jsx";
import API from "../utils/api";
import Surface from "../components/ui/Surface.jsx";
import Button from "../components/ui/Button.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import { CaseListSkeleton } from "../components/ui/LoadingState.jsx";
import { StatusBadge } from "../components/ui/Badge.jsx";

const ACTIVE=["PENDING_VALIDATION","PROCESSING_ANALYSIS","VALIDATION_PASSED","IN_PROGRESS","RESCUE_COMPLETED"];

export default function UserDashboard(){
 const {user}=useAuth(); const [cases,setCases]=useState([]); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
 const load=useCallback(async()=>{setLoading(true);setError("");try{const {data}=await API.get("/cases/mine");setCases(Array.isArray(data)?data:[]);}catch(e){setError(e.response?.data?.error||"We could not load your rescue activity.");}finally{setLoading(false);}},[]);
 useEffect(()=>{load();},[load]);
 const stats=useMemo(()=>({total:cases.length,active:cases.filter(c=>ACTIVE.includes(c.status)).length,resolved:cases.filter(c=>c.status==="RESOLVED").length}),[cases]);
 const current=cases.find(c=>["IN_PROGRESS","RESCUE_COMPLETED"].includes(c.status))||cases.find(c=>c.status==="VALIDATION_PASSED");
 return <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
  <section className="grid gap-6 lg:grid-cols-[1.4fr_.6fr]">
   <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-stone-900 to-stone-950 p-6 text-white sm:p-9"><div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-emerald-400/20 blur-3xl"/><div className="relative"><div className="flex items-center gap-2 text-emerald-300"><PawPrint size={17}/><span className="text-xs font-black uppercase tracking-[0.18em]">Reporter overview</span></div><h1 className="mt-3 text-3xl font-black sm:text-5xl">Hi, {user?.name?.split(" ")[0]||"there"}.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-stone-300">Your overview shows what needs your attention. Open My Cases when you want the complete report history.</p><div className="mt-6 flex flex-wrap gap-3"><Button as={Link} to="/report" className="bg-emerald-500 hover:bg-emerald-400"><Siren size={16}/> Report an animal</Button><Button as={Link} to="/dashboard/cases" variant="secondary" className="border-stone-700 bg-stone-800 text-white"><ArrowRight size={16}/> My cases</Button></div></div></div>
   <Surface className="p-6"><div className="flex items-center gap-2"><Sparkles size={17} className="text-emerald-600"/><h2 className="font-black dark:text-white">Current rescue</h2></div>{current?<div className="mt-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-stone-400">Case #{current.id}</p><h3 className="mt-1 text-xl font-black dark:text-white">{current.species||"Animal rescue"}</h3></div><StatusBadge status={current.status} friendly/></div><p className="mt-4 text-sm leading-6 text-stone-500">{current.issue_description||"Your case is moving through the rescue workflow."}</p><Link to={"/cases/"+current.id} className="mt-5 inline-flex items-center gap-2 text-sm font-black text-emerald-600">Track this rescue <ArrowRight size={15}/></Link></div>:<div className="mt-5 rounded-2xl bg-stone-50 p-5 dark:bg-stone-800/60"><p className="text-sm font-bold dark:text-white">No active rescue needs your attention.</p><p className="mt-1 text-xs text-stone-500">Submit a report whenever you see an animal that needs help.</p></div>}</Surface>
  </section>
  <section className="mt-6 grid grid-cols-3 gap-3"><Metric label="Reports" value={stats.total} Icon={PawPrint}/><Metric label="Active" value={stats.active} Icon={Clock3}/><Metric label="Resolved" value={stats.resolved} Icon={CheckCircle2}/></section>
  {error&&<div role="alert" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>}
  <section className="mt-8 grid gap-4 lg:grid-cols-3"><Action icon={<PawPrint/>} tone="emerald" title="My Rescue Cases" text="Open the full history, filter cases, and track individual reports." to="/dashboard/cases"/><Action icon={<MapPin/>} tone="sky" title="Rescue Map" text="See active rescue locations with available geographic data." to="/map"/></section>
  {loading&&<div className="mt-8"><CaseListSkeleton/></div>}
  {!loading&&cases.length===0&&<Surface className="mt-8 p-8"><EmptyState icon="🐾" title="Your first report starts the rescue" message="Use Report an animal to create your first rescue case."/></Surface>}
 </main>;
}
function Metric({label,value,Icon}){return <Surface className="p-4"><div className="flex items-center justify-between"><Icon size={17} className="text-emerald-600"/><span className="text-2xl font-black dark:text-white">{value}</span></div><p className="mt-3 text-[11px] font-black uppercase tracking-wider text-stone-400">{label}</p></Surface>}
function Action({icon,title,text,to,onClick,loading,tone}){const colors={emerald:"text-emerald-600 bg-emerald-500/10",sky:"text-sky-600 bg-sky-500/10",amber:"text-amber-600 bg-amber-500/10"};const body=<><span className={"grid h-10 w-10 place-items-center rounded-xl "+colors[tone]}>{icon}</span><h2 className="mt-4 text-lg font-black dark:text-white">{title}</h2><p className="mt-2 text-sm leading-6 text-stone-500">{text}</p></>;if(to)return <Link to={to} className="rounded-2xl border border-stone-200 bg-white p-5 transition-all hover:-translate-y-1 hover:shadow-lg dark:border-stone-800 dark:bg-stone-900">{body}<span className="mt-4 inline-flex text-sm font-black text-emerald-600">Open →</span></Link>;return <button onClick={onClick} disabled={loading} className="text-left rounded-2xl border border-stone-200 bg-white p-5 transition-all hover:-translate-y-1 hover:shadow-lg disabled:opacity-60 dark:border-stone-800 dark:bg-stone-900">{body}<span className="mt-4 inline-flex text-sm font-black text-amber-600">{loading?"Refreshing...":"Refresh now"}</span></button>}
