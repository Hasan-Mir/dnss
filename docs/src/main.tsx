import React from 'react';
import ReactDOM from 'react-dom/client';
import { installMockTauriIpc } from './mock-ipc';
import LandingPage from './LandingPage';

// Offline font families
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/700.css';

// Styles
import './styles.css';

// Initialize mock IPC bridge before App mounts
installMockTauriIpc();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <LandingPage />
    </React.StrictMode>
);
