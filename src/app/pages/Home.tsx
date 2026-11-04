import React, { useEffect, useState } from 'react';
import { Header } from '../components/Header';
import { ProductCard } from '../components/ProductCard';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import type { Product } from '../contexts/CartContext';
import { getSupabase } from '../lib/supabase';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { Search } from 'lucide-react';

export const Home: React.FC = () => {
  const { addToCart } = useCart();
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');

  useEffect(() => {
    let active = true;
    const loadProducts = async () => {
      try {
        const { data, error } = await getSupabase()
          .from('products')
          .select('id, name, description, price_cop, category, image_url')
          .eq('active', true)
          .order('name');
        if (error) throw error;
        if (active) {
          setProducts((data ?? []).map((product) => ({
            id: product.id,
            nombre: product.name,
            descripcion: product.description,
            precio: product.price_cop,
            categoria: product.category,
            imagen: product.image_url,
          })));
          setCatalogError('');
        }
      } catch (error) {
        if (active) setCatalogError(error instanceof Error ? error.message : 'No se pudo cargar el catálogo.');
      } finally {
        if (active) setLoadingProducts(false);
      }
    };
    void loadProducts();
    return () => { active = false; };
  }, []);

  const categories = ['Todas', ...Array.from(new Set(products.map(p => p.categoria)))];

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.descripcion.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'Todas' || product.categoria === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleAddToCart = (product: Product) => {
    if (!user) {
      toast.error('Debes iniciar sesión para agregar productos');
      return;
    }
    addToCart(product);
    toast.success(`${product.nombre} agregado al carrito`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        {/* Hero Banner */}
        <div className="bg-gradient-to-r from-yellow-400 via-red-500 to-blue-500 rounded-2xl p-8 mb-8 text-white">
          <h2 className="text-4xl font-bold mb-2">¡Bienvenido a RapiComida!</h2>
          <p className="text-xl">Las mejores comidas rápidas de Colombia 🇨🇴</p>
        </div>

        {/* Search and Filter */}
        <div className="mb-8 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar productos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                  selectedCategory === category
                    ? 'bg-gradient-to-r from-yellow-400 to-red-500 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:border-yellow-400'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Products Grid */}
        {loadingProducts && <p className="text-center text-gray-600">Cargando productos...</p>}
        {!loadingProducts && catalogError && <p role="alert" className="text-center text-red-700">{catalogError}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={handleAddToCart}
            />
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-12">
            <p className="text-xl text-gray-500">No se encontraron productos</p>
          </div>
        )}
      </div>
    </div>
  );
};
