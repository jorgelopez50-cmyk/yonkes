import React from 'react';
import { Plus } from 'lucide-react';
import { Product } from '../contexts/CartContext';
import { Button } from './ui/button';
import { Card, CardContent, CardFooter } from './ui/card';

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onAddToCart }) => {
  return (
    <Card className="overflow-hidden hover:shadow-xl transition-shadow duration-300 border-2 border-gray-200">
      <div className="relative h-48 overflow-hidden">
        <img
          src={product.imagen}
          alt={product.nombre}
          className="w-full h-full object-cover transition-transform duration-300 hover:scale-110"
        />
      </div>
      <CardContent className="p-4">
        <h3 className="font-bold text-lg mb-2">{product.nombre}</h3>
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{product.descripcion}</p>
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold text-red-600">
            ${product.precio.toLocaleString('es-CO')}
          </span>
          <span className="text-xs text-gray-500 bg-yellow-100 px-2 py-1 rounded-full">
            {product.categoria}
          </span>
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <Button
          onClick={() => onAddToCart(product)}
          className="w-full bg-gradient-to-r from-yellow-400 to-red-500 hover:from-yellow-500 hover:to-red-600 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Agregar al Carrito
        </Button>
      </CardFooter>
    </Card>
  );
};
