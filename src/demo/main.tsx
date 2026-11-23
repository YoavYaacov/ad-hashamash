import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import './demo.css';
import DemoApp from './DemoApp';
import { FONT } from '../config';

document.title = 'עד הנר האחרון · הדגמה';
document.documentElement.style.setProperty('--font', `'${FONT}'`);
createRoot(document.getElementById('root')!).render(<StrictMode><DemoApp /></StrictMode>);
