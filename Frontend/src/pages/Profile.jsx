import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

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

    <div className="min-h-[75vh] px-4 pb-10">

      <div className="max-w-2xl mx-auto">

        {/* Profile Header */}

        <div className="p-8 rounded-[2rem] bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[10px_10px_20px_#cbd5e1,_-10px_-10px_20px_#f8fafc] dark:shadow-[10px_10px_20px_#070a13,_-10px_-10px_20px_#172441]">

          <div className="flex flex-col items-center text-center">

            {/* Avatar */}

            <div className="w-24 h-24 rounded-full flex items-center justify-center text-4xl bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[inset_5px_5px_10px_#cbd5e1,_inset_-5px_-5px_10px_#f8fafc] dark:shadow-[inset_5px_5px_10px_#070a13,_inset_-5px_-5px_10px_#172441]">

              {currentRole.icon}

            </div>

            <h1 className="mt-5 text-2xl font-extrabold text-gray-800 dark:text-gray-100">

              {user.name || 'User'}

            </h1>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">

              {user.email}

            </p>

            <div className="flex flex-wrap justify-center gap-2 mt-4">

              <span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300">

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

            <p className="mt-4 max-w-md text-sm text-gray-500 dark:text-gray-400">

              {currentRole.description}

            </p>

          </div>

        </div>


        {/* Account Information */}

        <div className="mt-6 p-6 rounded-[2rem] bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[8px_8px_16px_#cbd5e1,_-8px_-8px_16px_#f8fafc] dark:shadow-[8px_8px_16px_#070a13,_-8px_-8px_16px_#172441]">

          <h2 className="text-lg font-extrabold text-gray-800 dark:text-gray-100">

            Account Information

          </h2>

          <div className="mt-5 space-y-4">

            <div>

              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">

                Full Name

              </p>

              <p className="mt-1 font-semibold text-gray-800 dark:text-gray-100">

                {user.name || 'Not available'}

              </p>

            </div>

            <div>

              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">

                Email

              </p>

              <p className="mt-1 font-semibold text-gray-800 dark:text-gray-100 break-all">

                {user.email}

              </p>

            </div>

            <div>

              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">

                Account Type

              </p>

              <p className="mt-1 font-semibold text-gray-800 dark:text-gray-100">

                {currentRole.title}

              </p>

            </div>

            <div>

              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">

                Account Status

              </p>

              <p className="mt-1 font-semibold text-gray-800 dark:text-gray-100">

                {accountStatus}

              </p>

            </div>

          </div>

        </div>


        {/* Role-specific section */}

        <div className="mt-6 p-6 rounded-[2rem] bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[8px_8px_16px_#cbd5e1,_-8px_-8px_16px_#f8fafc] dark:shadow-[8px_8px_16px_#070a13,_-8px_-8px_16px_#172441]">

          <h2 className="text-lg font-extrabold text-gray-800 dark:text-gray-100">

            {role === 'ngo'
              ? 'Organization'
              : role === 'volunteer'
                ? 'Volunteer Information'
                : role === 'admin'
                  ? 'Administration'
                  : 'Rescue Activity'}

          </h2>

          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">

            {role === 'ngo'
              ? 'Your NGO profile and organization information will appear here.'
              : role === 'volunteer'
                ? 'Your volunteer information, availability and rescue activity will appear here.'
                : role === 'admin'
                  ? 'Administrative account information and system management options will appear here.'
                  : 'Your reported rescue cases and activity will appear here.'}

          </p>

        </div>


        {/* Logout */}

        <button
          onClick={handleLogout}
          className="w-full mt-6 py-4 rounded-xl text-base font-bold text-rose-600 dark:text-rose-400 bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[6px_6px_12px_#cbd5e1,_-6px_-6px_12px_#f8fafc] dark:shadow-[6px_6px_12px_#070a13,_-6px_-6px_12px_#172441] hover:text-rose-700 dark:hover:text-rose-300 active:scale-[0.99] transition-all"
        >

          🚪 Logout

        </button>

      </div>

    </div>

  );
}