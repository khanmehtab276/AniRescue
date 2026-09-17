import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import API from '../utils/api';

export default function Login() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'USER'
  });

  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError(null);
    setIsLoading(true);

    const endpoint = isRegistering
      ? '/auth/register'
      : '/auth/login';

    try {
      const response = await API.post(
        endpoint,
        formData
      );

      const data = response.data;
      const token = data.token;

      if (!token) {
        throw new Error(
          'Authentication token was not returned by the server.'
        );
      }

      localStorage.setItem(
        'anirescue_token',
        token
      );

      localStorage.setItem(
        'token',
        token
      );

      const userData = data.user || data;

      const role =
        (userData.role || 'USER').toLowerCase();

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

      console.log(
        'Authenticated user:',
        normalizedUser
      );

      login(
        normalizedUser,
        token
      );

      /*
       * Role-based destination.
       *
       * ADMIN accounts are provisioned separately;
       * normal public registration does not create
       * an ADMIN account.
       */
      if (role === 'admin') {
        navigate('/admin');
      } else if (role === 'ngo') {
        navigate('/ngo');
      } else if (role === 'volunteer') {
        navigate('/volunteer');
      } else {
        navigate('/report');
      }

    } catch (err) {
      console.error(
        'Authentication error:',
        err
      );

      const backendError =
        err.response?.data?.error ||
        err.response?.data?.message;

      if (backendError) {
        setError(backendError);
      } else if (!err.response) {
        setError(
          'Cannot connect to the server. Please ensure the backend is running.'
        );
      } else if (err.response.status === 401) {
        setError(
          'Invalid email or password.'
        );
      } else {
        setError(
          'Something went wrong. Please try again.'
        );
      }

    } finally {
      setIsLoading(false);
    }
  };

  const inputCSS =
    'w-full px-4 py-3 rounded-xl bg-[#e2e8f0] dark:bg-[#0f172a] text-gray-800 dark:text-gray-100 outline-none transition-all duration-300 shadow-[inset_4px_4px_8px_#cbd5e1,inset_-4px_-4px_8px_#f8fafc] dark:shadow-[inset_4px_4px_8px_#070a13,inset_-4px_-4px_8px_#172441] focus:ring-2 focus:ring-emerald-500/50';

  return (
    <div className="flex items-center justify-center min-h-[75vh] px-4 transition-colors duration-300">

      <div className="w-full max-w-md p-8 md:p-10 rounded-[2rem] bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[10px_10px_20px_#cbd5e1,_-10px_-10px_20px_#f8fafc] dark:shadow-[10px_10px_20px_#070a13,_-10px_-10px_20px_#172441]">

        {/* Icon */}
        <div className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center text-3xl bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[inset_4px_4px_8px_#cbd5e1,inset_-4px_-4px_8px_#f8fafc] dark:shadow-[inset_4px_4px_8px_#070a13,inset_-4px_-4px_8px_#172441]">
          {isRegistering ? '🐾' : '👤'}
        </div>

        {/* Heading */}
        <h2 className="text-2xl font-extrabold text-center text-gray-800 dark:text-gray-100 mb-2">
          {isRegistering
            ? 'Create Account'
            : 'System Access'}
        </h2>

        <p className="text-sm font-medium text-center text-gray-500 dark:text-gray-400 mb-8">
          {isRegistering
            ? 'Create your AniRescue user account'
            : 'Sign in to access your AniRescue account'}
        </p>

        {/* Error */}
        {error && (
          <div className="p-3 mb-6 text-sm font-bold text-center text-rose-500 bg-rose-100 dark:bg-rose-900/30 rounded-xl shadow-sm border border-rose-200 dark:border-rose-800/50">
            {error}
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="space-y-6"
        >

          {/* Name */}
          {isRegistering && (
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 ml-1 uppercase tracking-wider">
                Full Name
              </label>

              <input
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleInputChange}
                className={inputCSS}
                placeholder="Rahul Sharma"
                autoComplete="name"
              />
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 ml-1 uppercase tracking-wider">
              Email Address
            </label>

            <input
              type="email"
              name="email"
              required
              value={formData.email}
              onChange={handleInputChange}
              className={inputCSS}
              placeholder="name@example.com"
              autoComplete="email"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 ml-1 uppercase tracking-wider">
              Password
            </label>

            <input
              type="password"
              name="password"
              required
              minLength={6}
              value={formData.password}
              onChange={handleInputChange}
              className={inputCSS}
              placeholder="••••••••"
              autoComplete={
                isRegistering
                  ? 'new-password'
                  : 'current-password'
              }
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 mt-2 rounded-xl text-lg font-bold bg-[#1a1f2e] dark:bg-black text-white shadow-[0_4px_10px_rgba(0,0,0,0.3)] hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading
              ? 'Processing...'
              : isRegistering
                ? 'Create Account'
                : 'Sign In'}
          </button>

        </form>

        {/* Register / Login switch */}
        <div className="mt-8 text-center">

          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">

            {isRegistering
              ? 'Already have an account? '
              : "Don't have an account? "}

            <button
              type="button"
              onClick={() => {
                setIsRegistering(
                  !isRegistering
                );

                setError(null);

                setFormData({
                  name: '',
                  email: '',
                  password: ''
                });
              }}
              className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              {isRegistering
                ? 'Sign In'
                : 'Register here'}
            </button>

          </p>

        </div>

      </div>
    </div>
  );
}