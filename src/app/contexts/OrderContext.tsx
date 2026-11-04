import React, { createContext, useContext, useState, useEffect } from 'react';
import { CartItem } from './CartContext';
import { getSupabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export type OrderStatus = 'pendiente' | 'en_preparacion' | 'en_camino' | 'entregado';
export type PaymentStatus = 'pendiente' | 'pagado' | 'fallido' | 'reembolsado';
export type PaymentMethod = 'stripe';

export interface Order {
  id: string;
  userId: string;
  userName: string;
  items: CartItem[];
  total: number;
  estado: OrderStatus;
  estadoPago: PaymentStatus;
  metodoPago: PaymentMethod;
  fecha: string;
  direccion: string;
  telefono: string;
}

interface OrderContextType {
  orders: Order[];
  createCheckoutSession: (items: CartItem[], direccion: string, telefono: string) => Promise<{ orderId: string; checkoutUrl: string }>;
  updateOrderStatus: (orderId: string, estado: OrderStatus) => Promise<void>;
  getUserOrders: (userId: string) => Order[];
  getOrderById: (orderId: string) => Order | undefined;
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

export const OrderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    if (!user) {
      setOrders([]);
      return;
    }

    let active = true;
    const client = getSupabase();
    const loadOrders = async () => {
      let query = client.from('orders').select('*, order_items(*)').order('created_at', { ascending: false });
      if (!isAdmin) query = query.eq('user_id', user.id);
      const { data, error } = await query;
      if (!active) return;
      if (error) {
        console.error('Could not load orders:', error.message);
        return;
      }
      setOrders((data ?? []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        userName: row.user_name,
        items: (row.order_items ?? []).map((item: any) => ({
          id: item.product_id ?? item.id,
          nombre: item.product_name,
          descripcion: '',
          precio: item.unit_price_cop,
          categoria: '',
          imagen: '',
          cantidad: item.quantity,
        })),
        total: row.total_cop,
        estado: row.status,
        estadoPago: row.payment_status,
        metodoPago: row.payment_method,
        fecha: row.created_at,
        direccion: row.address,
        telefono: row.phone,
      })));
    };

    void loadOrders();
    const channel = client.channel(`orders-${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders',
        ...(isAdmin ? {} : { filter: `user_id=eq.${user.id}` }),
      }, () => void loadOrders())
      .subscribe();

    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [user, isAdmin]);

  const createCheckoutSession = async (items: CartItem[], direccion: string, telefono: string) => {
    const { data, error } = await getSupabase().functions.invoke('create-checkout-session', {
      body: {
        items: items.map((item) => ({ productId: item.id, quantity: item.cantidad })),
        address: direccion,
        phone: telefono,
      },
    });
    if (error) throw error;
    if (!data?.orderId || !data?.checkoutUrl) throw new Error('Stripe no devolvió una URL de pago válida.');
    return { orderId: data.orderId as string, checkoutUrl: data.checkoutUrl as string };
  };

  const updateOrderStatus = async (orderId: string, estado: OrderStatus) => {
    const { error } = await getSupabase().rpc('admin_update_order_status', {
      p_order_id: orderId,
      p_new_status: estado,
    });
    if (error) throw error;
  };

  const getUserOrders = (userId: string): Order[] => {
    return orders.filter((order) => order.userId === userId);
  };

  const getOrderById = (orderId: string): Order | undefined => {
    return orders.find((order) => order.id === orderId);
  };

  return (
    <OrderContext.Provider
      value={{
        orders,
        createCheckoutSession,
        updateOrderStatus,
        getUserOrders,
        getOrderById,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
};

export const useOrders = () => {
  const context = useContext(OrderContext);
  if (context === undefined) {
    throw new Error('useOrders must be used within an OrderProvider');
  }
  return context;
};
