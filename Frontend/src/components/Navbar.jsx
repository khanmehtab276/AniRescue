import {
  Link,
  useLocation,
  useNavigate
} from 'react-router-dom';

import {
  Leaf,
  PawPrint,
  Siren,
  Map as MapIcon,
  Shield,
  Building2,
  ClipboardList,
  User,
  LogIn,
  LogOut,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';

import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';

/*
 * Role-specific navigation CONTENT — but every role renders through
 * the exact same markup/classes below, so the visual language never
 * changes between roles. No role gets its own accent color.
 */
function getNavLinksForRole(userRole) {
  if (!userRole) {
    return [{ name: 'Home', path: '/', Icon: Leaf }];
  }

  if (userRole === 'user') {
    return [
      { name: 'Dashboard', path: '/dashboard', Icon: PawPrint },
      { name: 'Report', path: '/report', Icon: Siren },
      { name: 'Map', path: '/map', Icon: MapIcon },
    ];
  }

  if (userRole === 'volunteer') {
    return [
      { name: 'Dashboard', path: '/volunteer', Icon: PawPrint },
      { name: 'Map', path: '/map', Icon: MapIcon },
    ];
  }

  if (userRole === 'ngo') {
    return [
      { name: 'Dashboard', path: '/ngo', Icon: Building2 },
      { name: 'Verify', path: '/verification', Icon: ClipboardList },
      { name: 'Map', path: '/map', Icon: MapIcon },
    ];
  }

  if (userRole === 'admin') {
    return [
      { name: 'Dashboard', path: '/admin', Icon: Shield },
      { name: 'Verify', path: '/verification', Icon: ClipboardList },
      { name: 'Map', path: '/map', Icon: MapIcon },
    ];
  }

  return [{ name: 'Dashboard', path: '/', Icon: Leaf }];
}

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

  const navLinks = getNavLinksForRole(user ? userRole : null);

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (

    <div className="flex justify-center mt-4 mb-6 px-3 relative z-50">

      <div className="flex items-center gap-2 w-full max-w-md">

        {/* Navigation */}

        <nav className="flex-1 flex items-center gap-1 p-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto no-scrollbar">

          {navLinks.map((link) => {

            const isActive = location.pathname === link.path;
            const isUrgent = link.path === '/report';

            return (

              <Link
                key={link.name}
                to={link.path}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors duration-150 ${
                  isActive
                    ? isUrgent
                      ? 'bg-amber-500 text-white'
                      : 'bg-emerald-600 text-white'
                    : isUrgent
                      ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <link.Icon size={15} strokeWidth={2.5} />
                <span>{link.name}</span>
              </Link>

            );

          })}

          <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-1 flex-shrink-0" />

          {user ? (
            <button
              type="button"
              onClick={handleLogout}
              className="flex-shrink-0 p-2 rounded-xl text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut size={16} strokeWidth={2.5} />
            </button>
          ) : null}

          <Link
            to={user ? '/profile' : '/login'}
            className={`flex-shrink-0 p-2 rounded-xl transition-colors duration-150 ${
              location.pathname === (user ? '/profile' : '/login')
                ? 'bg-emerald-600 text-white'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            aria-label={user ? 'Profile' : 'Login'}
          >
            {user ? <User size={16} strokeWidth={2.5} /> : <LogIn size={16} strokeWidth={2.5} />}
          </Link>

        </nav>


        {/* Theme */}

        <button
          onClick={cycleTheme}
          className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-slate-500 dark:text-slate-400"
          aria-label="Toggle Theme"
        >
          <ThemeIcon size={17} strokeWidth={2.5} />
        </button>

      </div>

    </div>

  );
}
