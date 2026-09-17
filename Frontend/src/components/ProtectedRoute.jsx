import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function ProtectedRoute({ allowedRoles }) {

  const {
    user,
    isInitializing
  } = useAuth();

  if (isInitializing) {
    return null;
  }

  // Not logged in
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  // Account must be ACTIVE
  const accountStatus =
    (user.account_status || '').toUpperCase();

  if (accountStatus !== 'ACTIVE') {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  // Check role
  const normalizedRole =
    (user.role || '').toLowerCase();

  const normalizedAllowed =
    allowedRoles.map(
      (role) => role.toLowerCase()
    );

  if (!normalizedAllowed.includes(normalizedRole)) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  return <Outlet />;
}