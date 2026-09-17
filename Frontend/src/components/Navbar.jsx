import {
  Link,
  useLocation,
  useNavigate
} from 'react-router-dom';

import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';

export default function Navbar() {

  const location = useLocation();
  const navigate = useNavigate();

  const { user, logout } = useAuth();
  const { theme, cycleTheme } = useTheme();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userRole = (user?.role || '').toLowerCase();

  const navLinks = [
    {
      name: 'Home',
      path: '/',
      icon: '🍃',
      color: 'bg-emerald-500'
    },

    {
      name: 'Report',
      path: '/report',
      icon: '🚨',
      color: 'bg-rose-500'
    },

    {
      name: 'Map',
      path: '/map',
      icon: '🗺️',
      color: 'bg-blue-500'
    }
  ];

  /*
   * Role-specific navigation
   */

  if (userRole === 'admin') {

    navLinks.push({
      name: 'Admin',
      path: '/admin',
      icon: '🛡️',
      color: 'bg-purple-500'
    });

  } else if (userRole === 'ngo') {

    navLinks.push({
      name: 'NGO',
      path: '/ngo',
      icon: '🏥',
      color: 'bg-indigo-500'
    });

  } else if (userRole === 'volunteer') {

    navLinks.push({
      name: 'Hub',
      path: '/volunteer',
      icon: '🦺',
      color: 'bg-amber-500'
    });

  }

  const getThemeIcon = () => {

    if (theme === 'light') return '☀️';

    if (theme === 'dark') return '🌙';

    return '💻';

  };

  return (

    <div className="flex justify-center mt-4 mb-6 px-3 relative z-50">

      <div className="flex items-center gap-2 w-full max-w-md">

        {/* Navigation */}

        <nav className="flex-1 flex items-center gap-1 p-2 rounded-full bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[6px_6px_12px_#cbd5e1,_-6px_-6px_12px_#f8fafc] dark:shadow-[6px_6px_12px_#070a13,_-6px_-6px_12px_#172441] overflow-x-auto no-scrollbar">

          {navLinks.map((link) => {

            const isActive =
              location.pathname === link.path;

            return (

              <Link
                key={link.name}
                to={link.path}
                className="relative flex-shrink-0"
              >

                {isActive && (

                  <div
                    className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-2/3 h-3 ${link.color} blur-md rounded-full opacity-80`}
                  />

                )}

                <div
                  className={`relative z-10 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all duration-300 active:scale-95 ${
                    isActive
                      ? 'bg-[#1a1f2e] dark:bg-black text-white shadow-[0_4px_10px_rgba(0,0,0,0.3)]'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >

                  <span>
                    {link.icon}
                  </span>

                  <span>
                    {link.name}
                  </span>

                </div>

              </Link>

            );

          })}

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1 flex-shrink-0" />

          {user ? (

            <Link
              to="/profile"
              className={`flex-shrink-0 px-3 py-2 rounded-full text-xs font-bold transition-all duration-300 active:scale-95 ${
                location.pathname === '/profile'
                  ? 'bg-[#1a1f2e] dark:bg-black text-white'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
              aria-label="Profile"
            >
              👤
            </Link>

          ) : (

            <Link
              to="/login"
              className={`flex-shrink-0 px-3 py-2 rounded-full text-xs font-bold ${
                location.pathname === '/login'
                  ? 'bg-[#1a1f2e] dark:bg-black text-white'
                  : 'text-gray-500'
              }`}
              aria-label="Login"
            >
              👤
            </Link>

          )}

        </nav>


        {/* Theme */}

        <button
          onClick={cycleTheme}
          className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full text-lg bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[6px_6px_12px_#cbd5e1,_-6px_-6px_12px_#f8fafc] dark:shadow-[6px_6px_12px_#070a13,_-6px_-6px_12px_#172441] active:scale-95"
          aria-label="Toggle Theme"
        >

          {getThemeIcon()}

        </button>

      </div>

    </div>

  );
}