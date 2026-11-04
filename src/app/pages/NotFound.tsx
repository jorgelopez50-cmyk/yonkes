import React from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Home } from 'lucide-react';

export const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-100 via-red-100 to-blue-100 flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-gray-300 mb-4">404</h1>
        <h2 className="text-3xl font-bold mb-4">Página no encontrada</h2>
        <p className="text-gray-600 mb-8">Lo sentimos, la página que buscas no existe.</p>
        <Button
          onClick={() => navigate('/')}
          className="bg-gradient-to-r from-yellow-400 to-red-500 hover:from-yellow-500 hover:to-red-600"
        >
          <Home className="h-5 w-5 mr-2" />
          Volver al Inicio
        </Button>
      </div>
    </div>
  );
};
