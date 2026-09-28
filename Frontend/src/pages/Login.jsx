import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import API from '../utils/api';
import useLocation from '../hooks/useLocation.js';

const REGISTER_ROLES = [
  { value: 'USER', label: 'Reporter', icon: '🐾' },
  { value: 'VOLUNTEER', label: 'Volunteer', icon: '🦺' },
  { value: 'NGO', label: 'NGO Partner', icon: '🏥' }
];

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  role: 'USER',
  phone: '',
  address: '',
  organizationName: '',
  contactPerson: '',
  maximumCoverageRadiusKm: ''
};

export default function Login() {
  const [isRegistering, setIsRegistering] = useState(false);

  const [formData, setFormData] = useState(EMPTY_FORM);

  const { location: detectedLocation, getLocation, isLoading: isLocating } = useLocation();

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

    if (isRegistering && formData.role === 'VOLUNTEER' && !formData.phone.trim()) {
      setError('Phone number is required for volunteer registration.');
      return;
    }

    if (isRegistering && formData.role === 'NGO') {
      if (
        !formData.organizationName.trim() ||
        !formData.contactPerson.trim() ||
        !formData.phone.trim() ||
        !formData.address.trim()
      ) {
        setError('Organization name, contact person, phone, and address are required for NGO registration.');
        return;
      }

      if (!detectedLocation) {
        setError('Please detect your organization\'s location before continuing.');
        return;
      }

      if (!formData.maximumCoverageRadiusKm || Number(formData.maximumCoverageRadiusKm) <= 0) {
        setError('Please enter a maximum coverage radius greater than 0.');
        return;
      }
    }

    setIsLoading(true);

    const endpoint = isRegistering
      ? '/auth/register'
      : '/auth/login';

    const payload = isRegistering
      ? {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
          ...(formData.role === 'VOLUNTEER' && {
            phone: formData.phone,
            address: formData.address || undefined,
          }),
          ...(formData.role === 'NGO' && {
            organizationName: formData.organizationName,
            contactPerson: formData.contactPerson,
            phone: formData.phone,
            address: formData.address,
            latitude: detectedLocation.lat,
            longitude: detectedLocation.lng,
            maximumCoverageRadiusKm: Number(formData.maximumCoverageRadiusKm),
          }),
        }
      : { email: formData.email, password: formData.password };

    try {
      const response = await API.post(
        endpoint,
        payload
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
        navigate('/dashboard');
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
      } else if (
        err.response.status === 403 &&
        err.response.data?.account_status === 'PENDING'
      ) {
        setError(
          'Your account is awaiting approval. Volunteer and NGO accounts must be activated before you can sign in.'
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
    'w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none transition-all duration-300 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-emerald-500/50';

  return (
    <div className="flex items-center justify-center min-h-[75vh] px-4 transition-colors duration-300">

      <div className="w-full max-w-md p-8 md:p-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">

        {/* Icon */}
        <div className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center text-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          {isRegistering ? '🐾' : '👤'}
        </div>

        {/* Heading */}
        <h2 className="text-2xl font-extrabold text-center text-slate-800 dark:text-slate-100 mb-2">
          {isRegistering
            ? 'Create Account'
            : 'System Access'}
        </h2>

        <p className="text-sm font-medium text-center text-slate-500 dark:text-slate-400 mb-8">
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
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 ml-1 uppercase tracking-wider">
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

          {/* Role */}
          {isRegistering && (
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 ml-1 uppercase tracking-wider">
                I am a...
              </label>

              <div className="flex gap-1.5 p-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                {REGISTER_ROLES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        role: option.value
                      })
                    }
                    className={`flex-1 py-2.5 rounded-lg text-[11px] font-bold transition-all duration-300 flex flex-col items-center gap-1 ${
                      formData.role === option.value
                        ? 'bg-[#1a1f2e] dark:bg-black text-white shadow-[0_4px_10px_rgba(0,0,0,0.3)]'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <span className="text-base">{option.icon}</span>
                    {option.label}
                  </button>
                ))}
              </div>

              {formData.role !== 'USER' && (
                <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400 font-medium ml-1">
                  Volunteer and NGO accounts require approval before you can sign in.
                </p>
              )}
            </div>
          )}

          {/* VOLUNTEER fields */}
          {isRegistering && formData.role === 'VOLUNTEER' && (
            <>
              <Field label="Phone Number">
                <input
                  type="tel"
                  name="phone"
                  required
                  value={formData.phone}
                  onChange={handleInputChange}
                  className={inputCSS}
                  placeholder="+91 98765 43210"
                  autoComplete="tel"
                />
              </Field>

              <Field label="Address (optional)">
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  className={inputCSS}
                  placeholder="Neighborhood, city"
                  autoComplete="street-address"
                />
              </Field>
            </>
          )}

          {/* NGO fields */}
          {isRegistering && formData.role === 'NGO' && (
            <>
              <Field label="Organization Name">
                <input
                  type="text"
                  name="organizationName"
                  required
                  value={formData.organizationName}
                  onChange={handleInputChange}
                  className={inputCSS}
                  placeholder="Happy Paws Rescue Trust"
                />
              </Field>

              <Field label="Contact Person">
                <input
                  type="text"
                  name="contactPerson"
                  required
                  value={formData.contactPerson}
                  onChange={handleInputChange}
                  className={inputCSS}
                  placeholder="Full name"
                  autoComplete="name"
                />
              </Field>

              <Field label="Phone Number">
                <input
                  type="tel"
                  name="phone"
                  required
                  value={formData.phone}
                  onChange={handleInputChange}
                  className={inputCSS}
                  placeholder="+91 98765 43210"
                  autoComplete="tel"
                />
              </Field>

              <Field label="Address">
                <input
                  type="text"
                  name="address"
                  required
                  value={formData.address}
                  onChange={handleInputChange}
                  className={inputCSS}
                  placeholder="Registered organization address"
                  autoComplete="street-address"
                />
              </Field>

              <Field label="Maximum Coverage Radius (km)">
                <input
                  type="number"
                  name="maximumCoverageRadiusKm"
                  required
                  min="1"
                  step="0.5"
                  value={formData.maximumCoverageRadiusKm}
                  onChange={handleInputChange}
                  className={inputCSS}
                  placeholder="15"
                />
              </Field>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 ml-1 uppercase tracking-wider">
                  Organization Location
                </label>

                {detectedLocation ? (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    <span>
                      Location detected ({detectedLocation.lat.toFixed(4)}, {detectedLocation.lng.toFixed(4)})
                    </span>
                    <button
                      type="button"
                      onClick={getLocation}
                      className="text-xs underline"
                    >
                      Re-detect
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      getLocation();
                    }}
                    disabled={isLocating}
                    className="w-full py-3 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-50"
                  >
                    {isLocating ? 'Detecting...' : 'Use My Current Location'}
                  </button>
                )}

              </div>
            </>
          )}

          {/* Email */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 ml-1 uppercase tracking-wider">
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
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 ml-1 uppercase tracking-wider">
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

          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">

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

                setFormData(EMPTY_FORM);
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


/* =========================================================
   FIELD (label + input wrapper)
========================================================= */

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 ml-1 uppercase tracking-wider">
        {label}
      </label>

      {children}
    </div>
  );
}
