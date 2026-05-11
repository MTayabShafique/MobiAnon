import React, { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ConfigProvider, Spin, theme } from 'antd';
import TopNav from './components/Layout/TopNav';

const Home   = lazy(() => import('./components/Map/MapCompare'));
const Upload = lazy(() => import('./pages/Upload'));
const Guide  = lazy(() => import('./pages/Guide'));
const SignUp = lazy(() => import('./components/Auth/SignUp'));
const Login  = lazy(() => import('./components/Auth/Login'));
const NotFound = lazy(() => import('./components/NotFound'));

const APP_THEME_KEY = 'bicycleAppTheme';

const PageSpinner = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
    <Spin size="large" tip="Loading…">
      <div style={{ width: 48, height: 48 }} />
    </Spin>
  </div>
);

function App() {
  const [themeMode, setThemeMode] = useState(() => {
    try { return localStorage.getItem(APP_THEME_KEY) || 'light'; } catch { return 'light'; }
  });

  useEffect(() => {
    try { localStorage.setItem(APP_THEME_KEY, themeMode); } catch { /* non-fatal */ }
  }, [themeMode]);

  const isDark = themeMode === 'dark';

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          borderRadius: 8,
          colorPrimary: '#1677ff',
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      }}
    >
      <Router>
        <div className={`app-shell ${isDark ? 'theme-dark' : 'theme-light'}`}>
          <TopNav themeMode={themeMode} setThemeMode={setThemeMode} />
          <main className="app-main">
            <Suspense fallback={<PageSpinner />}>
              <Routes>
                <Route path="/signup"  element={<SignUp />} />
                <Route path="/login"   element={<Login />} />
                <Route path="/"        element={<Home />} />
                <Route path="/upload"  element={<Upload />} />
                <Route path="/guide"   element={<Guide />} />
                <Route path="*"        element={<NotFound />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </Router>
    </ConfigProvider>
  );
}

export default App;
