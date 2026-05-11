import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ConfigProvider, Layout, theme } from 'antd';
import SignUp from './components/Auth/SignUp';
import Login from './components/Auth/Login';
import PrivateRoute from './components/PrivateRoute/PrivateRoute';
import Home from './components/Map/MapCompare';
import AppLayout from './components/Layout/AppLayout';
import NotFound from './components/NotFound';
import Sidebar from './components/Layout/Sidebar';
import Guide from './pages/Guide';
import Upload from './pages/Upload';

const { Content } = Layout;
const APP_THEME_KEY = 'bicycleAppTheme';

function App() {
  const [themeMode, setThemeMode] = useState(() => {
    try {
      return localStorage.getItem(APP_THEME_KEY) || 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(APP_THEME_KEY, themeMode);
    } catch {
      // Local storage is optional; the visual theme still works for this session.
    }
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
        <Layout className={`app-shell ${isDark ? 'theme-dark' : 'theme-light'}`}>
          <Sidebar collapsed={false} themeMode={themeMode} />
          <Layout className="app-main">
            <Content className="app-content">
              <Routes>
                <Route path="/signup" element={<SignUp />} />
                <Route path="/login" element={<Login />} />
                <Route
                  path="/"
                  element={
                    // <PrivateRoute>
                      <AppLayout>
                        <Home themeMode={themeMode} setThemeMode={setThemeMode} />
                      </AppLayout>
                    // </PrivateRoute>
                  }
                />
                <Route path="/upload" element={<Upload />} />
                <Route path="/guide" element={<Guide />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Content>
          </Layout>
        </Layout>
      </Router>
    </ConfigProvider>
  );
}

export default App;
