import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import NotificationSettings from '../components/NotificationSettings.jsx';

export default function Profile() {

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return null;
  }

  const role =
    (user.role || 'user').toLowerCase();

  const accountStatus =
    (user.account_status || 'ACTIVE').toUpperCase();

  const roleInfo = {

    user: {
      title: 'Animal Reporter',
      icon: '🐾',
      description:
        'Report animals that need rescue or assistance.',
    },

    volunteer: {
      title: 'Volunteer',
      icon: '🦺',
      description:
        'Help rescue animals and manage assigned cases.',
    },

    ngo: {
      title: 'NGO',
      icon: '🏥',
      description:
        'Coordinate rescue activities and volunteers.',
    },

    admin: {
      title: 'Administrator',
      icon: '🛡️',
      description:
        'Manage AniRescue operations and accounts.',
    }

  };

  const currentRole =
    roleInfo[role] || roleInfo.user;

  const handleLogout = () => {

    logout();

    navigate('/login');

  };

  const statusClass = {

    ACTIVE:
      'text-emerald-600 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/30',

    PENDING:
      'text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30',

    REJECTED:
      'text-rose-600 bg-rose-100 dark:text-rose-400 dark:bg-rose-900/30',

    SUSPENDED:
      'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30'

  };

  return (

    <div className="min-h-[75vh] px-4 pb-24 sm:px-6 lg:px-8 lg:pb-10">

      <div className="mx-auto max-w-6xl">

        {/* Profile Header */}

        <div className="p-8 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm">

          <div className="flex flex-col items-center text-center">

            {/* Avatar */}

            <div className="w-24 h-24 rounded-full flex items-center justify-center text-4xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">

              {currentRole.icon}

            </div>

            <h1 className="mt-5 text-2xl font-extrabold text-stone-800 dark:text-stone-100">

              {user.name || 'User'}

            </h1>

            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">

              {user.email}

            </p>

            <div className="flex flex-wrap justify-center gap-2 mt-4">

              <span className="px-3 py-1 rounded-full text-xs font-bold bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300">

                {currentRole.title}

              </span>

              <span
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  statusClass[accountStatus] ||
                  statusClass.ACTIVE
                }`}
              >

                {accountStatus}

              </span>

            </div>

            <p className="mt-4 max-w-md text-sm text-stone-500 dark:text-stone-400">

              {currentRole.description}

            </p>

          </div>

        </div>


        {/* Account Information */}

        <div className="mt-6 p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm">

          <h2 className="text-lg font-extrabold text-stone-800 dark:text-stone-100">

            Account Information

          </h2>

          <div className="mt-5 space-y-4">

            <div>

              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">

                Full Name

              </p>

              <p className="mt-1 font-semibold text-stone-800 dark:text-stone-100">

                {user.name || 'Not available'}

              </p>

            </div>

            <div>

              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">

                Email

              </p>

              <p className="mt-1 font-semibold text-stone-800 dark:text-stone-100 break-all">

                {user.email}

              </p>

            </div>

            <div>

              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">

                Account Type

              </p>

              <p className="mt-1 font-semibold text-stone-800 dark:text-stone-100">

                {currentRole.title}

              </p>

            </div>

            <div>

              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">

                Account Status

              </p>

              <p className="mt-1 font-semibold text-stone-800 dark:text-stone-100">

                {accountStatus}

              </p>

            </div>

          </div>

        </div>


        <NotificationSettings />

        {/* Role-specific section */}

        <div className="mt-6 p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm">

          <h2 className="text-lg font-extrabold text-stone-800 dark:text-stone-100">

            {role === 'ngo'
              ? 'Organization'
              : role === 'volunteer'
                ? 'Volunteer Information'
                : role === 'admin'
                  ? 'Administration'
                  : 'Rescue Activity'}

          </h2>

          <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">

            {role === 'ngo'
              ? 'Your operating area, rescue queue, volunteer coordination and verification tools are available from the NGO workspace.'
              : role === 'volunteer'
                ? 'Your availability, location freshness and assigned rescue activity are managed from the Rescue Hub.'
                : role === 'admin'
                  ? 'Global case operations, AI review, verification and user management are available from the Control Center.'
                  : 'Track every case you\'ve reported and its rescue status.'}

          </p>

          {role === 'user' && (
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="mt-4 w-full py-3 rounded-xl text-sm font-bold bg-emerald-600 text-white shadow-lg hover:-translate-y-0.5 transition-all"
            >
              View My Reported Cases →
            </button>
          )}

          {role === 'volunteer' && (
            <button
              type="button"
              onClick={() => navigate('/volunteer')}
              className="mt-4 w-full py-3 rounded-xl text-sm font-bold bg-[#1a1f2e] dark:bg-black text-white shadow-[0_4px_10px_rgba(0,0,0,0.3)] hover:-translate-y-0.5 transition-all"
            >
              Open Volunteer Hub →
            </button>
          )}

          {role === 'ngo' && (
            <button
              type="button"
              onClick={() => navigate('/ngo')}
              className="mt-4 w-full py-3 rounded-xl text-sm font-bold bg-[#1a1f2e] dark:bg-black text-white shadow-[0_4px_10px_rgba(0,0,0,0.3)] hover:-translate-y-0.5 transition-all"
            >
              Open Command Center →
            </button>
          )}

          {role === 'admin' && (
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="mt-4 w-full py-3 rounded-xl text-sm font-bold bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 transition-colors"
            >
              Open Admin Console →
            </button>
          )}

        </div>


        {/* Logout */}

        <button
          onClick={handleLogout}
          className="w-full mt-6 py-4 rounded-xl text-base font-bold text-rose-600 dark:text-rose-400 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm hover:text-rose-700 dark:hover:text-rose-300 active:scale-[0.99] transition-all"
        >

          🚪 Logout

        </button>

      </div>

    </div>

  );
}