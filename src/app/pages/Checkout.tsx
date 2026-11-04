import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Header } from '../components/Header';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useOrders } from '../contexts/OrderContext';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { toast } from 'sonner';
import { CreditCard } from 'lucide-react';

export const Checkout: React.FC = () => {
  const { cart, total } = useCart();
  const { user } = useAuth();
  const { createCheckoutSession } = useOrders();
  const navigate = useNavigate();

  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const totalConDomicilio = total + 5000;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error('Debes iniciar sesión');
      navigate('/login');
      return;
    }

    if (!direccion.trim() || !telefono.trim() || cart.length === 0) {
      toast.error('Por favor completa todos los campos');
      return;
    }

    setIsProcessing(true);
    try {
      const { checkoutUrl } = await createCheckoutSession(cart, direccion, telefono);
      window.location.assign(checkoutUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No fue posible iniciar el pago');
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Finalizar Compra</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Checkout Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-xl font-bold mb-4">Información de Entrega</h2>
                  
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="direccion">Dirección de Entrega</Label>
                      <Input
                        id="direccion"
                        placeholder="Calle 123 # 45-67, Bogotá"
                        value={direccion}
                        onChange={(e) => setDireccion(e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="telefono">Teléfono de Contacto</Label>
                      <Input
                        id="telefono"
                        type="tel"
                        placeholder="300 123 4567"
                        value={telefono}
                        onChange={(e) => setTelefono(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <h2 className="text-xl font-bold mb-4">Método de Pago</h2>
                  <div className="flex items-center gap-3 rounded-lg border-2 border-gray-200 p-4">
                    <CreditCard className="h-6 w-6 text-blue-700" />
                    <span className="font-medium">Pago seguro con Stripe</span>
                  </div>
                  <p className="mt-3 text-sm text-gray-600">
                    El importe final se calcula en el servidor. Los métodos disponibles dependen de la cuenta de Stripe.
                  </p>
                </CardContent>
              </Card>

              <Button
                type="submit"
                disabled={isProcessing}
                className="w-full bg-gradient-to-r from-yellow-400 to-red-500 hover:from-yellow-500 hover:to-red-600 h-12 text-lg"
              >
                {isProcessing ? 'Procesando...' : `Pagar $${totalConDomicilio.toLocaleString('es-CO')}`}
              </Button>
            </form>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardContent className="p-6">
                <h2 className="text-xl font-bold mb-4">Resumen del Pedido</h2>
                
                <div className="space-y-3 mb-4">
                  {cart.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span>{item.cantidad}x {item.nombre}</span>
                      <span>${(item.precio * item.cantidad).toLocaleString('es-CO')}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t pt-3 space-y-2">
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
                        ${totalConDomicilio.toLocaleString('es-CO')}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
