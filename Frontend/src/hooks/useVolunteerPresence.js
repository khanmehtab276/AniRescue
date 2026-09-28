import { useCallback, useEffect, useRef, useState } from 'react';
import API from '../utils/api';

// The backend only offers volunteers to dispatchers when their last
// location update is under 5 minutes old, so refresh well inside that.
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

/**
 * status is null until this session has actually confirmed a value
 * with the backend — /auth/me does not currently return
 * availability_status, so the app cannot know it on first load.
 */
export default function useVolunteerPresence() {
  const [status, setStatus] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');
  const intervalRef = useRef(null);

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

  const stopRefreshing = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

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

        stopRefreshing();

        if (confirmed === 'AVAILABLE') {
          await pushLocation();
          intervalRef.current = setInterval(pushLocation, LOCATION_REFRESH_MS);
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
    [pushLocation, stopRefreshing]
  );

  useEffect(() => stopRefreshing, [stopRefreshing]);

  return { status, isUpdating, error, setAvailability };
}
