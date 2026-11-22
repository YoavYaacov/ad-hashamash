import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { APP_NAME, isConfigured } from './config';

// Three fully separate interfaces, each its own bundle: the screen never ships host code.
const Screen = lazy(() => import('./pages/Screen'));
const Host = lazy(() => import('./pages/Host'));
const Play = lazy(() => import('./pages/Play'));

export default function App() {
  if (!isConfigured) {
    return (
      <div className="setup-needed">
        <h1>{APP_NAME}</h1>
        <p>חסרות הגדרות חיבור לשרת. העתיקו את <code>.env.example</code> ל-<code>.env</code> ומלאו את פרטי Supabase.</p>
      </div>
    );
  }
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Suspense fallback={<div className="loading">טוען…</div>}>
        <Routes>
          <Route path="/screen" element={<Screen />} />
          <Route path="/host" element={<Host />} />
          <Route path="/play" element={<Play />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

function Home() {
  return (
    <div className="home">
      <h1>{APP_NAME}</h1>
      <Link className="primary" to="/play">הצטרפות למשחק</Link>
    </div>
  );
}
