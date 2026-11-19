import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Headings: IBM Plex Serif, bundled so it works offline (only the 600 weight is used).
import '@fontsource/ibm-plex-serif/600.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
