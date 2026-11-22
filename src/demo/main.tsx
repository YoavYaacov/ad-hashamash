import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import './demo.css';
import DemoApp from './DemoApp';
import { pickFont } from '../config';

document.title = 'עד השמש · הדגמה';
document.documentElement.style.setProperty('--font', `'${pickFont()}'`);
createRoot(document.getElementById('root')!).render(<StrictMode><DemoApp /></StrictMode>);
