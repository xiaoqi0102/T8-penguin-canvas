import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';

const app = import.meta.env.DEV && import.meta.env.VITE_T8_STRICT_MODE !== '1'
  ? <App />
  : (
    <StrictMode>
      <App />
    </StrictMode>
  );

createRoot(document.getElementById('root')!).render(app);
