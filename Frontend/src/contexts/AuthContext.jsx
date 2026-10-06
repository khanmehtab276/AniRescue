import {
  createContext,
  useContext,
  useState,
  useEffect,
} from 'react';
import { PawPrint } from 'lucide-react';
import API, { refreshCsrfToken, setCsrfToken } from '../utils/api';

const AuthContext = createContext();

function normalizeUser(userData = {}) {
  return {
    id: userData.id,
    email: userData.email,
    name: userData.full_name || userData.name || 'User',
    role: (userData.role || '').toLowerCase(),
    account_status: userData.account_status || 'ACTIVE',
    jurisdiction_lat: userData.jurisdiction_lat ?? null,
    jurisdiction_lng: userData.jurisdiction_lng ?? null,
    jurisdiction_radius_km: userData.jurisdiction_radius_km ?? null,
    availability_status: userData.availability_status ?? null,
    latitude: userData.latitude ?? null,
    longitude: userData.longitude ?? null,
    location_updated_at: userData.location_updated_at ?? null,
    volunteer_phone: userData.volunteer_phone ?? null,
    volunteer_address: userData.volunteer_address ?? null,
    organization_name: userData.organization_name ?? null,
    contact_person: userData.contact_person ?? null,
    organization_phone: userData.organization_phone ?? null,
    organization_address: userData.organization_address ?? null,
    maximum_coverage_radius_km: userData.maximum_coverage_radius_km ?? null,
  };
}

function clearLegacyCredentials() {
  localStorage.removeItem('token');
  localStorage.removeItem('anirescue_token');
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('anirescue_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    /*
     * The browser already has a persistent HttpOnly session cookie after
     * the first successful login. Do not block every app launch on /auth/me.
     * The cached identity lets the PWA open immediately, including offline.
     *
     * The server remains authoritative: every protected API request still
     * validates the HttpOnly session cookie and current account/role state.
     * refreshUser() is available when a page explicitly needs fresh data.
     */
    clearLegacyCredentials();

    try {
      const savedUser = localStorage.getItem('anirescue_user');

      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
    } catch (error) {
      console.warn('Could not restore cached AniRescue identity:', error);
      localStorage.removeItem('anirescue_user');
      setUser(null);
    } finally {
      setIsInitializing(false);
    }
  }, []);

  useEffect(() => {
    /*
     * Revalidate the cached identity in the background. This keeps startup
     * instant/offline-friendly while allowing the server to refresh role,
     * availability, jurisdiction, and other account fields without forcing
     * a login screen on every launch.
     */
    let cancelled = false;

    const syncSession = async () => {
      try {
        const response = await API.get('/auth/me');
        if (cancelled) return;

        await refreshCsrfToken();

        const normalizedUser = normalizeUser(
          response.data?.user || response.data,
        );

        setUser(normalizedUser);
        localStorage.setItem(
          'anirescue_user',
          JSON.stringify(normalizedUser),
        );
      } catch (error) {
        if (cancelled) return;

        if (error?.response?.status === 401) {
          setCsrfToken(null);
          localStorage.removeItem('anirescue_user');
          setUser(null);
        } else {
          // Network/offline failure must not erase a valid cached identity.
          console.warn(
            'Background AniRescue session refresh skipped:',
            error?.message || error,
          );
        }
      }
    };

    void syncSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = (userData) => {
    clearLegacyCredentials();

    const normalizedUser = normalizeUser(userData);
    setUser(normalizedUser);

    localStorage.setItem(
      'anirescue_user',
      JSON.stringify(normalizedUser),
    );
  };

  const logout = async () => {
    try {
      await API.post('/auth/logout');
    } catch (error) {
      // Local session state is still cleared if the network is unavailable.
      console.warn('Logout request failed:', error?.message || error);
    } finally {
      clearLegacyCredentials();
      setCsrfToken(null);
      localStorage.removeItem('anirescue_user');
      setUser(null);
    }
  };

  const refreshUser = async () => {
    try {
      const response = await API.get('/auth/me');
      await refreshCsrfToken();
      const normalizedUser = normalizeUser(
        response.data?.user || response.data,
      );

      setUser(normalizedUser);
      localStorage.setItem(
        'anirescue_user',
        JSON.stringify(normalizedUser),
      );

      return normalizedUser;
    } catch (error) {
      console.error('Failed to refresh user:', error);
      return null;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        refreshUser,
        isInitializing,
      }}
    >
      {!isInitializing ? (
        children
      ) : (
        <div
          role="status"
          aria-live="polite"
          className="flex h-screen w-full items-center justify-center bg-stone-50 dark:bg-stone-950"
        >
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-stone-200 bg-white p-8 shadow-sm dark:border-stone-800 dark:bg-stone-900">
            <div className="relative grid h-16 w-16 place-items-center rounded-full bg-emerald-50 dark:bg-emerald-900/20">
              <PawPrint
                size={26}
                strokeWidth={2}
                className="text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-extrabold text-stone-800 dark:text-stone-100">
                AniRescue
              </p>
              <p className="mt-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                Authenticating session...
              </p>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
