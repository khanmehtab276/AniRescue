import { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { AuthProvider } from "./contexts/AuthContext.jsx";
import { ThemeProvider } from "./contexts/ThemeContext.jsx";
import { ToastProvider } from "./contexts/ToastContext.jsx";
import PushBridge from "./components/PushBridge.jsx";

const Home = lazy(() => import("./pages/Landing.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const ReportCase = lazy(() => import("./pages/ReportCase.jsx"));
const UserDashboard = lazy(() => import("./pages/UserDashboard.jsx"));
const UserCases = lazy(() => import("./pages/UserCases.jsx"));
const MapView = lazy(() => import("./pages/MapView.jsx"));
const VolunteerWorkspace = lazy(() => import("./pages/VolunteerWorkspace.jsx"));
const NGOWorkspace = lazy(() => import("./pages/NGOWorkspace.jsx"));
const AdminWorkspace = lazy(() => import("./pages/AdminWorkspace.jsx"));
const Profile = lazy(() => import("./pages/Profile.jsx"));
const CaseDetail = lazy(() => import("./pages/CaseDetail.jsx"));
const VerificationQueue = lazy(() => import("./pages/VerificationQueue.jsx"));

function RouteTransition({ children }) {
  const location = useLocation();
  return <div id="main-content" tabIndex={-1} key={location.pathname} className="animate-rescue-fade-up outline-none">{children}</div>;
}

const ALL = ["user", "volunteer", "ngo", "admin"];

export default function App() {
  return <ThemeProvider><ToastProvider><AuthProvider><Router>
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-emerald-600 focus:text-white focus:font-bold">Skip to content</a>
    <Navbar /><PushBridge />
    <Suspense fallback={<div role="status" className="min-h-[60vh] flex items-center justify-center"><div className="w-10 h-10 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" aria-hidden="true"/><span className="sr-only">Loading</span></div>}>
      <RouteTransition><Routes>
        <Route path="/" element={<Home/>}/>
        <Route path="/login" element={<Login/>}/>

        <Route element={<ProtectedRoute allowedRoles={ALL}/>}>
          <Route path="/report" element={<ReportCase/>}/>
          <Route path="/profile" element={<Profile/>}/>
          <Route path="/map" element={<MapView/>}/>
          <Route path="/cases/:id" element={<CaseDetail/>}/>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["user"]}/>}>
          <Route path="/dashboard" element={<UserDashboard/>}/>
          <Route path="/dashboard/cases" element={<UserCases/>}/>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["volunteer","admin"]}/>}>
          <Route path="/volunteer" element={<VolunteerWorkspace/>}/>
          <Route path="/volunteer/cases" element={<VolunteerWorkspace/>}/>
          <Route path="/volunteer/active" element={<VolunteerWorkspace/>}/>
          <Route path="/volunteer/history" element={<VolunteerWorkspace/>}/>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["ngo"]}/>}>
          <Route path="/ngo" element={<NGOWorkspace/>}/>
          <Route path="/ngo/cases" element={<NGOWorkspace/>}/>
          <Route path="/ngo/volunteers" element={<NGOWorkspace/>}/>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["ngo","admin"]}/>}>
          <Route path="/verification" element={<VerificationQueue/>}/>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["admin"]}/>}>
          <Route path="/admin" element={<AdminWorkspace/>}/>
          <Route path="/admin/cases" element={<AdminWorkspace/>}/>
          <Route path="/admin/ai-validation" element={<AdminWorkspace/>}/>
        </Route>

        <Route path="*" element={<Home/>}/>
      </Routes></RouteTransition>
    </Suspense>
  </Router></AuthProvider></ToastProvider></ThemeProvider>;
}
