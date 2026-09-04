import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { installTVRuntime } from './lib/platform';
import './index.css';
import './home.css';

installTVRuntime();

createRoot(document.getElementById('root')!).render(
  <App />
);
