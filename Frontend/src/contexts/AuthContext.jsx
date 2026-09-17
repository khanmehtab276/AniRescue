import {
  createContext,
  useContext,
  useState,
  useEffect
} from 'react';

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
              userData.account_status || 'ACTIVE'

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


  return (

    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isInitializing
      }}
    >

      {!isInitializing ? (
        children
      ) : (

        <div className="flex h-screen w-full items-center justify-center bg-[#e2e8f0] dark:bg-[#0f172a]">

          <div className="flex flex-col items-center gap-4 p-8 rounded-[2rem] bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[10px_10px_20px_#cbd5e1,_-10px_-10px_20px_#f8fafc] dark:shadow-[10px_10px_20px_#070a13,_-10px_-10px_20px_#172441]">

            <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[inset_4px_4px_8px_#cbd5e1,inset_-4px_-4px_8px_#f8fafc] dark:shadow-[inset_4px_4px_8px_#070a13,inset_-4px_-4px_8px_#172441]">

              <span className="text-2xl animate-bounce">
                🐾
              </span>

              <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />

            </div>

            <div className="text-center">

              <p className="text-sm font-extrabold text-gray-800 dark:text-gray-100">
                AniRescue
              </p>

              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 animate-pulse mt-1">
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