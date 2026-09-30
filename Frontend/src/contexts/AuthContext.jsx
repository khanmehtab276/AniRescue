import {
  createContext,
  useContext,
  useState,
  useEffect
} from 'react';
import { PawPrint } from 'lucide-react';

import API from '../utils/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {

  const [user, setUser] = useState(() => {

    try {

      const savedUser =
        localStorage.getItem('anirescue_user');

      return savedUser
        ? JSON.parse(savedUser)
        : null;

    } catch {

      return null;

    }

  });

  const [isInitializing, setIsInitializing] =
    useState(true);


  useEffect(() => {

    const initAuth = async () => {

      const token =
        localStorage.getItem('token') ||
        localStorage.getItem('anirescue_token');

      if (!token) {

        setUser(null);
        setIsInitializing(false);

        return;

      }

      try {

        localStorage.setItem('token', token);
        localStorage.setItem(
          'anirescue_token',
          token
        );

        const response =
          await API.get('/auth/me');

        const userData =
          response.data?.user ||
          response.data;

        const normalizedUser = {
          id: userData.id,
          email: userData.email,
          name:
            userData.full_name ||
            userData.name ||
            'User',
          role:
            (userData.role || '').toLowerCase(),

          account_status:
              userData.account_status || 'ACTIVE',

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

        setUser(normalizedUser);

        localStorage.setItem(
          'anirescue_user',
          JSON.stringify(normalizedUser)
        );

      } catch (error) {

        console.error(
          'Auth initialization error:',
          error
        );

        /*
         * PWA offline behavior:
         * keep cached identity if device is offline.
         */

        const status = error.response?.status;

        if (!navigator.onLine || !error.response) {
          const savedUser =
            localStorage.getItem('anirescue_user');

          if (savedUser) {
            try {
              setUser(JSON.parse(savedUser));
            } catch {
              setUser(null);
            }
          }
        } else if (status === 401 || status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('anirescue_token');
          localStorage.removeItem('anirescue_user');

          setUser(null);
        }

      } finally {

        setIsInitializing(false);

      }

    };

    initAuth();

  }, []);


  const login = (userData, token) => {

    if (token) {

      localStorage.setItem(
        'token',
        token
      );

      localStorage.setItem(
        'anirescue_token',
        token
      );

    }

    const normalizedUser = {

      ...userData,

      role:
        (userData.role || '').toLowerCase()

    };

    setUser(normalizedUser);

    localStorage.setItem(
      'anirescue_user',
      JSON.stringify(normalizedUser)
    );

  };


  const logout = () => {

    localStorage.removeItem('token');

    localStorage.removeItem(
      'anirescue_token'
    );

    localStorage.removeItem(
      'anirescue_user'
    );

    setUser(null);

  };


  /*
   * Re-fetches /auth/me and updates the cached user object. Used
   * after a backend change to the user's own record — e.g. an NGO
   * saving their jurisdiction — that isn't reflected in the token.
   */
  const refreshUser = async () => {
    try {
      const response = await API.get('/auth/me');
      const userData = response.data?.user || response.data;

      const normalizedUser = {
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

      setUser(normalizedUser);
      localStorage.setItem('anirescue_user', JSON.stringify(normalizedUser));

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
        isInitializing
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

          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm">

            <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-900/20">

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

              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                Authenticating session...
              </p>

            </div>

          </div>

        </div>

      )}

    </AuthContext.Provider>

  );
}

export const useAuth = () =>
  useContext(AuthContext);