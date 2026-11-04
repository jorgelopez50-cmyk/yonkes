import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';

export const Login: React.FC = () => {
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerNombre, setRegisterNombre] = useState('');
  
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const success = await login(loginEmail, loginPassword);
      if (success) {
        toast.success('¡Bienvenido!');
        navigate('/');
      } else {
        toast.error('Credenciales incorrectas');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No fue posible iniciar sesión');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerNombre || !registerEmail || !registerPassword) {
      toast.error('Por favor completa todos los campos');
      return;
    }
    try {
      const result = await register(registerEmail, registerPassword, registerNombre);
      if (!result.success) {
        toast.error('El email ya está registrado');
      } else if (result.confirmationRequired) {
        toast.success('Cuenta creada. Revisa tu correo para confirmar el registro.');
      } else {
        toast.success('¡Cuenta creada exitosamente!');
        navigate('/');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No fue posible crear la cuenta');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-100 via-red-100 to-blue-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-gradient-to-r from-yellow-400 to-red-500 p-4 rounded-full">
              <span className="text-5xl">🍔</span>
            </div>
          </div>
          <CardTitle className="text-3xl">RapiComida</CardTitle>
          <CardDescription>Tu comida favorita, rápido y fácil</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Iniciar Sesión</TabsTrigger>
              <TabsTrigger value="register">Registrarse</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="tu@email.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Contraseña</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-yellow-400 to-red-500 hover:from-yellow-500 hover:to-red-600"
                >
                  Iniciar Sesión
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="register-nombre">Nombre</Label>
                  <Input
                    id="register-nombre"
                    type="text"
                    placeholder="Tu nombre"
                    value={registerNombre}
                    onChange={(e) => setRegisterNombre(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-email">Email</Label>
                  <Input
                    id="register-email"
                    type="email"
                    placeholder="tu@email.com"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-password">Contraseña</Label>
                  <Input
                    id="register-password"
                    type="password"
                    placeholder="••••••••"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-yellow-400 to-red-500 hover:from-yellow-500 hover:to-red-600"
                >
                  Crear Cuenta
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
