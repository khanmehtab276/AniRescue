import { Suspense, lazy } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation
} from 'react-router-dom';

import Navbar from './components/Navbar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { ThemeProvider } from './contexts/ThemeContext.jsx';
import { ToastProvider } from './contexts/ToastContext.jsx';
import PushBridge from './components/PushBridge.jsx';


/* =========================================================
   LAZY-LOADED PAGES
   ========================================================= */

const Home = lazy(
  () => import('./pages/Landing.jsx')
);

const Login = lazy(
  () => import('./pages/Login.jsx')
);

const ReportCase = lazy(
  () => import('./pages/ReportCase.jsx')
);

const UserDashboard = lazy(
  () => import('./pages/UserDashboard.jsx')
);

const MapView = lazy(
  () => import('./pages/MapView.jsx')
);

const VolunteerDashboard = lazy(
  () => import('./pages/VolunteerDashboard.jsx')
);

const AdminDashboard = lazy(
  () => import('./pages/AdminDashboard.jsx')
);

const NGODashboard = lazy(
  () => import('./pages/NGODashboard.jsx')
);

const Profile = lazy(
  () => import('./pages/Profile.jsx')
);

const CaseDetail = lazy(
  () => import('./pages/CaseDetail.jsx')
);

const VerificationQueue = lazy(
  () => import('./pages/VerificationQueue.jsx')
);

/* =========================================================
   ROUTE TRANSITION
   Re-keys on the path so each page fades in when you navigate.
   Motion is disabled globally under prefers-reduced-motion.
   ========================================================= */

function RouteTransition({ children }) {
  const location = useLocation();

  return (
    <div
      id="main-content"
      tabIndex={-1}
      key={location.pathname}
      className="animate-rescue-fade-up outline-none"
    >
      {children}
    </div>
  );
}

/* =========================================================
   APP
   ========================================================= */

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>

          <Router>

            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-emerald-600 focus:text-white focus:font-bold"
            >
              Skip to content
            </a>

            <Navbar />
            <PushBridge />

            <Suspense
              fallback={
                <div
                  role="status"
                  className="min-h-[60vh] flex items-center justify-center"
                >
                  <div
                    className="w-10 h-10 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin"
                    aria-hidden="true"
                  />
                  <span className="sr-only">Loading</span>
                </div>
              }
            >

              <RouteTransition>
              <Routes>

                {/* =================================================
                    PUBLIC ROUTES
                    ================================================= */}

                <Route
                  path="/"
                  element={<Home />}
                />

                <Route
                  path="/login"
                  element={<Login />}
                />


                {/* =================================================
                    AUTHENTICATED RESCUE REPORTING

                    All authenticated roles can submit a rescue case.
                    Backend authorization remains the final security
                    layer.
                    ================================================= */}

                <Route
                  element={
                    <ProtectedRoute
                      allowedRoles={[
                        'user',
                        'volunteer',
                        'admin',
                        'ngo'
                      ]}
                    />
                  }
                >

                  <Route
                    path="/report"
                    element={<ReportCase />}
                  />

                </Route>

                {/* =================================================
                    USER PERSONAL DASHBOARD

                    Reporting users get their own feed of
                    reported cases and status tracking.
                    ================================================= */}

                <Route
                  element={
                    <ProtectedRoute
                      allowedRoles={['user']}
                    />
                  }
                >

                  <Route
                    path="/dashboard"
                    element={<UserDashboard />}
                  />

                </Route>

                {/* =================================================
                    PROFILE

                    Every authenticated account can access its
                    own profile. Role-specific content is handled
                    inside Profile.jsx.
                    ================================================= */}

                <Route
                  element={
                    <ProtectedRoute
                      allowedRoles={[
                        'user',
                        'volunteer',
                        'ngo',
                        'admin'
                      ]}
                    />
                  }
                >

                  <Route
                    path="/profile"
                    element={<Profile />}
                  />

                </Route>

                {/* =================================================
                    VOLUNTEER AREA

                    Admin is also allowed because admin has broader
                    operational access.
                    ================================================= */}

                <Route
                  element={
                    <ProtectedRoute
                      allowedRoles={[
                        'volunteer',
                        'admin'
                      ]}
                    />
                  }
                >

                  <Route
                    path="/volunteer"
                    element={<VolunteerDashboard />}
                  />

                </Route>


                {/* =================================================
                    ADMIN AREA

                    STRICTLY ADMIN ONLY
                    ================================================= */}

                <Route
                  element={
                    <ProtectedRoute
                      allowedRoles={['admin']}
                    />
                  }
                >

                  <Route
                    path="/admin"
                    element={<AdminDashboard />}
                  />

                </Route>


                {/* =================================================
                    NGO AREA

                    NGO functionality will be verified against the
                    current backend implementation separately.
                    ================================================= */}

                <Route
                  element={
                    <ProtectedRoute
                      allowedRoles={['ngo']}
                    />
                  }
                >

                  <Route
                    path="/ngo"
                    element={<NGODashboard />}
                  />

                </Route>


                {/* =================================================
                    CASE DETAIL — shared across every authenticated
                    role. Backend enforces per-case authorization;
                    this route just needs "is logged in".
                    ================================================= */}

                <Route
                  element={
                    <ProtectedRoute
                      allowedRoles={[
                        'user',
                        'volunteer',
                        'ngo',
                        'admin'
                      ]}
                    />
                  }
                >

                  <Route
                    path="/map"
                    element={<MapView />}
                  />

                  <Route
                    path="/cases/:id"
                    element={<CaseDetail />}
                  />

                </Route>

                {/* =================================================
                    VERIFICATION QUEUE — NGO + ADMIN
                    ================================================= */}

                <Route
                  element={
                    <ProtectedRoute
                      allowedRoles={['ngo', 'admin']}
                    />
                  }
                >

                  <Route
                    path="/verification"
                    element={<VerificationQueue />}
                  />

                </Route>

                {/* =================================================
                    FALLBACK
                    ================================================= */}

                <Route
                  path="*"
                  element={<Home />}
                />

              </Routes>
              </RouteTransition>

            </Suspense>

          </Router>

        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}