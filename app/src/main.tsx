import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { startAppUpdates } from './lib/appUpdate'; // updates
import '@fontsource/baloo-2/700.css';
import '@fontsource/baloo-2/800.css';
import '@fontsource-variable/nunito-sans';
import './styles.css';
import { App } from './App';

startAppUpdates(); // updates

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
