/**
 * Interactive demo: the real interfaces wired to an in-memory server, all on one page.
 * Mobile: tabs. Wide screens: the projector on top and three phones side by side.
 */
import { useMemo, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ClientContext } from '../lib/clientContext';
import { MockServer } from './mockServer';
import { createMockClient } from './mockClient';
import Screen from '../pages/Screen';
import Host from '../pages/Host';
import Play from '../pages/Play';
import { APP_NAME } from '../config';

const server = new MockServer();
(window as unknown as { demoServer: MockServer }).demoServer = server;

const VIEWS = [
  { id: 'screen', label: 'מסך הקרנה' },
  { id: 'host', label: 'מנחה' },
  { id: 'p1', label: 'קבוצה 1' },
  { id: 'p2', label: 'קבוצה 2' },
] as const;
type ViewId = (typeof VIEWS)[number]['id'];

export default function DemoApp() {
  const clients = useMemo(() => ({
    screen: createMockClient(server, { userId: 'screen' }),
    host: createMockClient(server, { userId: 'host-demo', host: true }),
    p1: createMockClient(server, { userId: 'phone-1' }),
    p2: createMockClient(server, { userId: 'phone-2' }),
  }), []);
  const [tab, setTab] = useState<ViewId>('screen');
  const [toast, setToast] = useState('');
  const say = (t: string) => { setToast(t); setTimeout(() => setToast(''), 2200); };

  const helper = (fn: () => void, ok: string) => () => {
    try { fn(); say(ok); } catch (e) { say(`לא עכשיו: ${(e as Error).message}`); }
  };

  return (
    <div className="demo-shell">
      <header className="demo-top">
        <b>{APP_NAME} · הדגמה</b>
        <span className="demo-note">שרת מדומה בדפדפן · נתוני דמה</span>
      </header>
      <nav className="demo-tabs" role="tablist">
        {VIEWS.map((v) => (
          <button key={v.id} role="tab" aria-selected={tab === v.id} className={tab === v.id ? 'on' : ''} onClick={() => setTab(v.id)}>{v.label}</button>
        ))}
      </nav>
      <div className="demo-helpers">
        <span>עוזרי הדגמה:</span>
        <button onClick={helper(() => server.addBots(6), 'נוספו 6 קבוצות בוט')}>+6 קבוצות בוט</button>
        <button onClick={helper(() => server.botsPlay(), 'הבוטים שלחו תשובות')}>הבוטים עונים עכשיו</button>
        <button onClick={() => setTab('host')}>למנחה ←</button>
      </div>
      {toast && <div className="demo-toast" role="status">{toast}</div>}

      <div className={`demo-stage show-${tab}`}>
        <section className="demo-pane pane-screen" hidden={false} data-active={tab === 'screen'}>
          <div className="demo-label">מסך הקרנה (16:9)</div>
          <div className="screen-frame">
            <ClientContext.Provider value={clients.screen}><Screen /></ClientContext.Provider>
          </div>
        </section>
        <section className="demo-pane pane-host" data-active={tab === 'host'}>
          <div className="demo-label">טלפון מנחה</div>
          <div className="phone-frame">
            <ClientContext.Provider value={clients.host}><Host /></ClientContext.Provider>
          </div>
        </section>
        {(['p1', 'p2'] as const).map((p, i) => (
          <section key={p} className={`demo-pane pane-${p}`} data-active={tab === p}>
            <div className="demo-label">טלפון קבוצה {i + 1}</div>
            <div className="phone-frame">
              <MemoryRouter initialEntries={['/play']}>
                <ClientContext.Provider value={clients[p]}><Play /></ClientContext.Provider>
              </MemoryRouter>
            </div>
          </section>
        ))}
      </div>

      <details className="demo-guide" open>
        <summary>איך מנסים (2 דקות)</summary>
        <ol>
          <li><b>מנחה:</b> לוחצים "ניסיון", ואז "פתיחת הרשמה".</li>
          <li><b>קבוצה 1 וקבוצה 2:</b> כותבים שמות משתתפים ולוחצים "מצטרפים!". שם הקבוצה מוגרל. רוצים עוד קבוצות? "+6 קבוצות בוט".</li>
          <li><b>מנחה:</b> "נעילת הרשמה", ואז "התחלת המשחק", ואז "פתיחת הסבב".</li>
          <li>עונים בטלפוני הקבוצות, ו"הבוטים עונים עכשיו" מוסיף תשובות של הבוטים.</li>
          <li><b>מנחה:</b> "סגירת הגשות", "בדיקה אוטומטית", "חשיפת פתרון וניקוד", "הצגת טבלת דירוג", "לסבב הבא". הניקוד והמקום של כל קבוצה מופיעים בטלפון שלה.</li>
        </ol>
        <p>השאלות כאן הן שאלות ניסיון עם תשובות ידועות. לדוגמה, קוד הכספת הוא 5976 והתשובה לגמר היא 49.</p>
      </details>
    </div>
  );
}
