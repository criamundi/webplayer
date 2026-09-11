import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { installTVRuntime } from './lib/platform';
import { supabaseConfigError, supabaseConfigReady } from './lib/supabase';
import './index.css';
import './home.css';
import './tv.css';

installTVRuntime();

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Elemento #root não encontrado.');
}

if (!supabaseConfigReady) {
  rootElement.innerHTML = `
    <main style="min-height:100vh;background:#070b09;color:#fff;display:flex;align-items:center;justify-content:center;padding:48px;font-family:Arial,sans-serif;box-sizing:border-box;text-align:center">
      <div style="max-width:900px">
        <div style="font-size:48px;font-weight:800;margin-bottom:18px;color:#bef264">Top TV Digital</div>
        <div style="font-size:28px;font-weight:700;margin-bottom:12px">Configuração do servidor ausente</div>
        <div style="font-size:20px;line-height:1.5;color:#cbd5e1">${supabaseConfigError || 'Configure o backend e gere o aplicativo novamente.'}</div>
      </div>
    </main>`;
} else {
  createRoot(rootElement).render(<App />);
}
