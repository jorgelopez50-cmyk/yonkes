import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { Header } from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import { useOrders, Order, OrderStatus } from '../contexts/OrderContext';
import { useCart } from '../contexts/CartContext';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Package, Clock, Truck, CheckCircle, MapPin, Phone } from 'lucide-react';

export const OrderTracking: React.FC = () => {
  const { user } = useAuth();
  const { orders, getOrderById } = useOrders();
  const { clearCart } = useCart();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('order');
  const checkoutSucceeded = searchParams.get('checkout') === 'success';
  const userOrders = user ? orders.filter((order) => order.userId === user.id) : [];

  useEffect(() => {
    if (checkoutSucceeded && orderId) clearCart();
  }, [checkoutSucceeded, orderId]);

  const getStatusIcon = (status: OrderStatus) => {
    switch (status) {
      case 'pendiente':
        return <Clock className="h-5 w-5" />;
      case 'en_preparacion':
        return <Package className="h-5 w-5" />;
      case 'en_camino':
        return <Truck className="h-5 w-5" />;
      case 'entregado':
        return <CheckCircle className="h-5 w-5" />;
    }
  };

  const getStatusLabel = (status: OrderStatus) => {
    switch (status) {
      case 'pendiente':
        return 'Pendiente';
      case 'en_preparacion':
        return 'En Preparación';
      case 'en_camino':
        return 'En Camino';
      case 'entregado':
        return 'Entregado';
    }
  };

  const getStatusColor = (status: OrderStatus) => {
    switch (status) {
      case 'pendiente':
        return 'bg-yellow-500';
      case 'en_preparacion':
        return 'bg-blue-500';
      case 'en_camino':
        return 'bg-purple-500';
      case 'entregado':
        return 'bg-green-500';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    if (status === 'pagado') return 'bg-green-500';
    if (status === 'fallido') return 'bg-red-500';
    return 'bg-orange-500';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPaymentMethodLabel = (method: string) => {
    const methods: { [key: string]: string } = {
      'stripe': 'Stripe',
    };
    return methods[method] || method;
  };

  const displayOrders = orderId
    ? [getOrderById(orderId), ...userOrders.filter((order) => order.id !== orderId)].filter(Boolean) as Order[]
    : userOrders;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Mis Pedidos</h1>

        {checkoutSucceeded && displayOrders.some((order) => order.id === orderId && order.estadoPago !== 'pagado') && (
          <div role="status" className="mb-6 rounded-md border border-blue-200 bg-blue-50 p-4 text-blue-900">
            Estamos confirmando el pago. El estado se actualizará cuando Stripe notifique el resultado.
          </div>
        )}

        {displayOrders.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <p className="text-xl text-gray-500">No tienes pedidos aún</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {displayOrders.map((order) => (
              <Card key={order.id} className={orderId === order.id ? 'border-2 border-yellow-400' : ''}>
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row gap-6">
                    {/* Order Info */}
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="font-bold text-lg mb-1">Pedido #{order.id.slice(-8)}</h3>
                          <p className="text-sm text-gray-600">{formatDate(order.fecha)}</p>
                        </div>
                        <div className="flex gap-2">
                          <Badge className={`${getStatusColor(order.estado)} text-white`}>
                            {getStatusLabel(order.estado)}
                          </Badge>
                          <Badge className={`${getPaymentStatusColor(order.estadoPago)} text-white`}>
                            {order.estadoPago === 'pagado' ? 'Pagado' : order.estadoPago === 'fallido' ? 'Pago fallido' : order.estadoPago === 'reembolsado' ? 'Reembolsado' : 'Pendiente'}
                          </Badge>
                        </div>
                      </div>

                      {/* Order Items */}
                      <div className="space-y-2 mb-4">
                        {order.items.map((item) => (
                          <div key={item.id} className="flex justify-between text-sm">
                            <span>{item.cantidad}x {item.nombre}</span>
                            <span>${(item.precio * item.cantidad).toLocaleString('es-CO')}</span>
                          </div>
                        ))}
                      </div>

                      {/* Delivery Info */}
                      <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="h-4 w-4 text-gray-600" />
                          <span>{order.direccion}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-4 w-4 text-gray-600" />
                          <span>{order.telefono}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">Método de pago:</span>
                          <span>{getPaymentMethodLabel(order.metodoPago)}</span>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t">
                        <div className="flex justify-between font-bold text-lg">
                          <span>Total</span>
                          <span className="text-red-600">${order.total.toLocaleString('es-CO')}</span>
                        </div>
                      </div>
                    </div>

                    {/* Order Status Timeline */}
                    <div className="lg:w-64">
                      <h4 className="font-bold mb-4">Estado del Pedido</h4>
                      <div className="space-y-4">
                        {(['pendiente', 'en_preparacion', 'en_camino', 'entregado'] as OrderStatus[]).map((status, index) => {
                          const isCompleted = getStatusIndex(order.estado) >= index;
                          const isCurrent = order.estado === status;
                          
                          return (
                            <div key={status} className="flex items-center gap-3">
                              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                                isCompleted 
                                  ? isCurrent 
                                    ? 'bg-gradient-to-r from-yellow-400 to-red-500 text-white' 
                                    : 'bg-green-500 text-white'
                                  : 'bg-gray-200 text-gray-400'
                              }`}>
                                {getStatusIcon(status)}
                              </div>
                              <span className={`text-sm ${isCompleted ? 'font-medium' : 'text-gray-400'}`}>
                                {getStatusLabel(status)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function getStatusIndex(status: OrderStatus): number {
  const statuses: OrderStatus[] = ['pendiente', 'en_preparacion', 'en_camino', 'entregado'];
  return statuses.indexOf(status);
}