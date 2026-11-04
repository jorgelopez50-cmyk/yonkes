import React, { useState } from 'react';
import { Header } from '../components/Header';
import { useOrders, OrderStatus } from '../contexts/OrderContext';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { Package, DollarSign, TrendingUp, Clock, Download } from 'lucide-react';

export const AdminPanel: React.FC = () => {
  const { orders, updateOrderStatus } = useOrders();
  const [selectedFilter, setSelectedFilter] = useState<'todos' | OrderStatus>('todos');

  const filteredOrders = selectedFilter === 'todos' 
    ? orders 
    : orders.filter(o => o.estado === selectedFilter);

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus);
      toast.success('Estado actualizado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el estado');
    }
  };

  const handleExportData = () => {
    const data = orders.map(order => ({
      id: order.id,
      fecha: order.fecha,
      cliente: order.userName,
      total: order.total,
      estado: order.estado,
      estadoPago: order.estadoPago,
      metodoPago: order.metodoPago
    }));
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pedidos_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    toast.success('Datos exportados');
  };

  const getStatusLabel = (status: OrderStatus) => {
    const labels: { [key in OrderStatus]: string } = {
      'pendiente': 'Pendiente',
      'en_preparacion': 'En Preparación',
      'en_camino': 'En Camino',
      'entregado': 'Entregado'
    };
    return labels[status];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('es-CO', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Estadísticas
  const totalVentas = orders.filter(o => o.estadoPago === 'pagado').reduce((sum, order) => sum + order.total, 0);
  const pedidosPendientes = orders.filter(o => o.estado === 'pendiente').length;
  const pedidosEntregados = orders.filter(o => o.estado === 'entregado').length;
  const pagosPendientes = orders.filter(o => o.estadoPago === 'pendiente').reduce((sum, o) => sum + o.total, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Panel de Administración</h1>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Ventas Totales</p>
                  <p className="text-2xl font-bold text-green-600">
                    ${totalVentas.toLocaleString('es-CO')}
                  </p>
                </div>
                <DollarSign className="h-12 w-12 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Pedidos Pendientes</p>
                  <p className="text-2xl font-bold text-yellow-600">{pedidosPendientes}</p>
                </div>
                <Clock className="h-12 w-12 text-yellow-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Pedidos Entregados</p>
                  <p className="text-2xl font-bold text-blue-600">{pedidosEntregados}</p>
                </div>
                <Package className="h-12 w-12 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Pagos Pendientes</p>
                  <p className="text-2xl font-bold text-orange-600">
                    ${pagosPendientes.toLocaleString('es-CO')}
                  </p>
                </div>
                <TrendingUp className="h-12 w-12 text-orange-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="mb-6">
          <Tabs defaultValue="todos" onValueChange={(value) => setSelectedFilter(value as any)}>
            <TabsList>
              <TabsTrigger value="todos">Todos ({orders.length})</TabsTrigger>
              <TabsTrigger value="pendiente">Pendientes ({orders.filter(o => o.estado === 'pendiente').length})</TabsTrigger>
              <TabsTrigger value="en_preparacion">En Preparación ({orders.filter(o => o.estado === 'en_preparacion').length})</TabsTrigger>
              <TabsTrigger value="en_camino">En Camino ({orders.filter(o => o.estado === 'en_camino').length})</TabsTrigger>
              <TabsTrigger value="entregado">Entregados ({orders.filter(o => o.estado === 'entregado').length})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Orders Table */}
        <div className="space-y-4">
          {filteredOrders.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Package className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <p className="text-xl text-gray-500">No hay pedidos</p>
              </CardContent>
            </Card>
          ) : (
            filteredOrders.map((order) => (
              <Card key={order.id}>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Order Info */}
                    <div className="lg:col-span-4">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="bg-gradient-to-r from-yellow-400 to-red-500 text-white p-2 rounded-lg">
                          <Package className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-bold">#{order.id.slice(-8)}</h3>
                          <p className="text-sm text-gray-600">{formatDate(order.fecha)}</p>
                          <p className="text-sm font-medium mt-1">{order.userName}</p>
                        </div>
                      </div>
                      <div className="text-sm space-y-1 text-gray-600">
                        <p>📍 {order.direccion}</p>
                        <p>📞 {order.telefono}</p>
                        <p>💳 {order.metodoPago.replace('_', ' ').toUpperCase()}</p>
                      </div>
                    </div>

                    {/* Order Items */}
                    <div className="lg:col-span-4">
                      <h4 className="font-medium mb-2">Productos:</h4>
                      <div className="space-y-1 text-sm">
                        {order.items.map((item) => (
                          <div key={item.id} className="flex justify-between">
                            <span>{item.cantidad}x {item.nombre}</span>
                            <span className="text-gray-600">
                              ${(item.precio * item.cantidad).toLocaleString('es-CO')}
                            </span>
                          </div>
                        ))}
                        <div className="border-t pt-2 mt-2 flex justify-between font-bold">
                          <span>Total:</span>
                          <span className="text-red-600">${order.total.toLocaleString('es-CO')}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="lg:col-span-4 space-y-3">
                      <div>
                        <label className="text-sm font-medium mb-2 block">Estado del Pedido</label>
                        <Select
                          value={order.estado}
                          onValueChange={(value) => void handleStatusChange(order.id, value as OrderStatus)}
                          disabled={order.estadoPago !== 'pagado' || order.estado === 'entregado'}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pendiente">Pendiente</SelectItem>
                            <SelectItem value="en_preparacion">En Preparación</SelectItem>
                            <SelectItem value="en_camino">En Camino</SelectItem>
                            <SelectItem value="entregado">Entregado</SelectItem>
                          </SelectContent>
                        </Select>
                        {order.estadoPago !== 'pagado' && (
                          <p className="text-xs text-orange-600 mt-1">
                            El pedido debe estar pagado para avanzar
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Badge className={order.estadoPago === 'pagado' ? 'bg-green-500' : order.estadoPago === 'fallido' ? 'bg-red-500' : 'bg-orange-500'}>
                          {order.estadoPago === 'pagado' ? 'Pagado' : order.estadoPago === 'fallido' ? 'Fallido' : order.estadoPago === 'reembolsado' ? 'Reembolsado' : 'Pendiente'}
                        </Badge>
                        <Badge className="bg-blue-500">
                          {getStatusLabel(order.estado)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Export Data Button */}
        <div className="mt-8">
          <Button onClick={handleExportData}>
            <Download className="h-4 w-4 mr-2" />
            Exportar Datos
          </Button>
        </div>
      </div>
    </div>
  );
};