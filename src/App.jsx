import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from 'antd';
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

function App() {
  return (
    <Router>
      <Layout style={{ minHeight: '100vh' }}>
        <Sidebar collapsed={false} />
        <Layout>
          <Content style={{ margin: '16px', padding: '16px', background: '#fff' }}>
            <Routes>
              <Route path="/signup" element={<SignUp />} />
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  // <PrivateRoute>
                    <AppLayout>
                      <Home />
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
  );
}

export default App;
