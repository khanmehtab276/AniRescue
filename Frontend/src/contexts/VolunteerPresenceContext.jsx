import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import API from '../utils/api';
import { useAuth } from './AuthContext.jsx';

const VolunteerPresenceContext = createContext(null);

// The backend only treats a volunteer's location as fresh for five minutes.
// Keep refreshing well inside that window while the volunteer is available.
const LOCATION_REFRESH_MS = 2 * 60 * 1000;

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not supported on this device.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      () =>
        reject(
          new Error(
            'Location permission is needed so dispatchers can find you.'
          )
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
}

export function VolunteerPresenceProvider({ children }) {
  const { user } = useAuth();
  const [status, setStatus] = useState(user?.availability_status ?? null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');
  const intervalRef = useRef(null);

  const stopRefreshing = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const pushLocation = useCallback(async () => {
    try {
      const coords = await getPosition();
      await API.put('/auth/location', coords);
      setError('');
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.message ||
          'Could not update your location.'
      );
    }
  }, []);

  const startRefreshing = useCallback(() => {
    stopRefreshing();
    void pushLocation();
    intervalRef.current = setInterval(() => {
      void pushLocation();
    }, LOCATION_REFRESH_MS);
  }, [pushLocation, stopRefreshing]);

  const setAvailability = useCallback(
    async (next) => {
      setIsUpdating(true);
      setError('');

      try {
        const { data } = await API.put('/auth/availability', {
          availability: next,
        });

        const confirmed = data?.user?.availability_status || next;
        setStatus(confirmed);

        if (confirmed === 'AVAILABLE' || confirmed === 'ON_RESCUE') {
          startRefreshing();
        } else {
          stopRefreshing();
        }

        return true;
      } catch (err) {
        const message =
          err.response?.status === 403
            ? "You can't change availability while on an active rescue."
            : err.response?.data?.error || 'Could not update availability.';

        setError(message);
        return false;
      } finally {
        setIsUpdating(false);
      }
    },
    [startRefreshing, stopRefreshing]
  );

  // The provider lives above the route tree, so navigation between pages no
  // longer destroys the volunteer presence session or its location timer.
  useEffect(() => {
    if (!user || user.role !== 'volunteer') {
      stopRefreshing();
      setStatus(null);
      setError('');
      return undefined;
    }

    const nextStatus = user.availability_status ?? 'OFFLINE';
    setStatus(nextStatus);

    if (nextStatus === 'AVAILABLE' || nextStatus === 'ON_RESCUE') {
      startRefreshing();
    } else {
      stopRefreshing();
    }

    return stopRefreshing;
  }, [
    user?.id,
    user?.role,
    user?.availability_status,
    startRefreshing,
    stopRefreshing,
  ]);

  return (
    <VolunteerPresenceContext.Provider
      value={{ status, isUpdating, error, setAvailability }}
    >
      {children}
    </VolunteerPresenceContext.Provider>
  );
}

export function useVolunteerPresence() {
  const context = useContext(VolunteerPresenceContext);

  if (!context) {
    throw new Error(
      'useVolunteerPresence must be used inside VolunteerPresenceProvider.'
    );
  }

  return context;
}
