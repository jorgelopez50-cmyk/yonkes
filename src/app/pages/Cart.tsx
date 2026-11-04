import React from 'react';
import { useNavigate } from 'react-router';
import { Header } from '../components/Header';
import { useCart } from '../contexts/CartContext';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';

export const Cart: React.FC = () => {
  const { cart, removeFromCart, updateQuantity, total } = useCart();
  const navigate = useNavigate();

  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="container mx-auto px-4 py-16 text-center">
          <ShoppingBag className="h-24 w-24 mx-auto text-gray-300 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Tu carrito está vacío</h2>
          <p className="text-gray-600 mb-6">¡Agrega algunos productos deliciosos!</p>
          <Button
            onClick={() => navigate('/')}
            className="bg-gradient-to-r from-yellow-400 to-red-500 hover:from-yellow-500 hover:to-red-600"
          >
            Ver Menú
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Tu Carrito</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            {cart.map((item) => (
              <Card key={item.id}>
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    <img
                      src={item.imagen}
                      alt={item.nombre}
                      className="w-24 h-24 object-cover rounded-lg"
                    />
                    
                    <div className="flex-1">
                      <h3 className="font-bold text-lg mb-1">{item.nombre}</h3>
                      <p className="text-sm text-gray-600 mb-2">{item.descripcion}</p>
                      <p className="text-xl font-bold text-red-600">
                        ${item.precio.toLocaleString('es-CO')}
                      </p>
                    </div>

                    <div className="flex flex-col items-end justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFromCart(item.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuantity(item.id, item.cantidad - 1)}
                          className="h-8 w-8 p-0"
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="font-bold w-8 text-center">{item.cantidad}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuantity(item.id, item.cantidad + 1)}
                          className="h-8 w-8 p-0"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardContent className="p-6">
                <h2 className="text-2xl font-bold mb-4">Resumen del Pedido</h2>
                
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>${total.toLocaleString('es-CO')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Domicilio</span>
                    <span>$5,000</span>
                  </div>
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between font-bold text-xl">
                      <span>Total</span>
                      <span className="text-red-600">
                        ${(total + 5000).toLocaleString('es-CO')}
                      </span>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => navigate('/checkout')}
                  className="w-full bg-gradient-to-r from-yellow-400 to-red-500 hover:from-yellow-500 hover:to-red-600"
                >
                  Proceder al Pago
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
