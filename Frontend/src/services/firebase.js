import { initializeApp } from "firebase/app";
import { getMessaging, isSupported, onMessage } from "firebase/messaging";

const requiredFirebaseConfig = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

// Validate that all required Firebase config values are present
const missingConfig = requiredFirebaseConfig.filter(key => !import.meta.env[key]);
if (missingConfig.length > 0) {
  console.warn(
    `Firebase configuration incomplete. Missing: ${missingConfig.join(', ')}. ` +
    'Push notifications will not work. Please check your .env file.'
  );
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Only initialize Firebase if all required config is present
let app = null;
if (missingConfig.length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  console.warn('Firebase app not initialized due to missing configuration.');
}

const getFirebaseMessaging = async () => {
  const supported = await isSupported();

  if (!supported) {
    console.warn("Firebase Cloud Messaging is not supported in this browser.");
    return null;
  }

  if (!app) {
    console.warn("Firebase app not initialized. Cannot get messaging instance.");
    return null;
  }

  return getMessaging(app);
};

export {
  app,
  getFirebaseMessaging,
  onMessage,
};
