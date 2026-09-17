import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Import the PWA registration script provided by Vite
import { registerSW } from 'virtual:pwa-register';

// Automatically update the Service Worker if a new version is deployed
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm("New update available. Reload?")) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log("AniRescue is ready to work offline.");
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);