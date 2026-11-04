import { RouterProvider } from 'react-router';
import { router } from './routes';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { OrderProvider } from './contexts/OrderContext';
import { Toaster } from 'sonner';

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <OrderProvider>
          <RouterProvider router={router} />
          <Toaster position="top-right" richColors />
        </OrderProvider>
      </CartProvider>
    </AuthProvider>
  );
}