import { createBrowserRouter, Navigate } from 'react-router';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Cart } from './pages/Cart';
import { Checkout } from './pages/Checkout';
import { OrderTracking } from './pages/OrderTracking';
import { AdminPanel } from './pages/AdminPanel';
import { NotFound } from './pages/NotFound';
import { useAuth } from './contexts/AuthContext';

const ProtectedRoute = ({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) => {
  const { user, isAdmin, loading } = useAuth();

  if (loading) return <div className="p-8 text-center">Cargando sesión...</div>;
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Home />,
  },
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/cart',
    element: (
      <ProtectedRoute>
        <Cart />
      </ProtectedRoute>
    ),
  },
  {
    path: '/checkout',
    element: (
      <ProtectedRoute>
        <Checkout />
      </ProtectedRoute>
    ),
  },
  {
    path: '/tracking',
    element: (
      <ProtectedRoute>
        <OrderTracking />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin',
    element: (
      <ProtectedRoute adminOnly>
        <AdminPanel />
      </ProtectedRoute>
    ),
  },
  {
    path: '*',
    element: <NotFound />,
  },
]);