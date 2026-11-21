import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Headings: IBM Plex Serif, bundled so it works offline (only the 600 weight is used).
import '@fontsource/ibm-plex-serif/600.css';
import './styles.css';

// No pinch-zooming the app (the photo pop-out zooms its photo itself). The viewport tag and
// touch-action cover most browsers; Safari also needs its gesture events stopped.
for (const t of ['gesturestart', 'gesturechange'])
  document.addEventListener(t, (e) => e.preventDefault(), { passive: false });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
