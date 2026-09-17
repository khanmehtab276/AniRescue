import { useState } from 'react';

export default function useLocation() {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const getLocation = () => {
    setIsLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      setIsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setIsLoading(false);
      },
      (err) => {
        let message = 'Unable to get your location.';

        if (err.code === 1) {
          message = 'Location permission was denied.';
        } else if (err.code === 2) {
          message = 'Your location could not be determined.';
        } else if (err.code === 3) {
          message = 'Location request timed out. Please try again.';
        }

        setError(message);
        setIsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return { location, error, isLoading, getLocation };
}