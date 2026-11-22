import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { APP_NAME_PLAIN, pickFont } from './config';

document.title = APP_NAME_PLAIN;
document.documentElement.style.setProperty('--font', `'${pickFont()}'`);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
