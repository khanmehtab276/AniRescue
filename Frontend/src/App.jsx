import { Suspense, lazy } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route
} from 'react-router-dom';

import Navbar from './components/Navbar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

import { AuthProvider } from './contexts/AuthContext.jsx';
import { ThemeProvider } from './contexts/ThemeContext.jsx';


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

/* =========================================================
   APP
   ========================================================= */

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>

        <Router>

          <Navbar />

          <Suspense
            fallback={
              <div className="min-h-[75vh] flex items-center justify-center bg-[#e2e8f0] dark:bg-[#0f172a]">

                <div
                  className="w-12 h-12 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin"
                  aria-label="Loading"
                />

              </div>
            }
          >

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

              <Route
                path="/map"
                element={<MapView />}
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
                  FALLBACK
                  ================================================= */}

              <Route
                path="*"
                element={<Home />}
              />

            </Routes>

          </Suspense>

        </Router>

      </AuthProvider>
    </ThemeProvider>
  );
}