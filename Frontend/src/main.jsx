import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import PWAUpdatePrompt from './components/PWAUpdatePrompt.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <PWAUpdatePrompt />
  </React.StrictMode>,
);
