import React from "react";
import { Link, useNavigate } from "react-router";
import {
  ShoppingCart,
  User,
  LogOut,
  Package,
  LayoutDashboard,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";
import { Button } from "./ui/button";

export const Header: React.FC = () => {
  const { user, logout, isAdmin } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();

  const handleLogout = () => {
    void logout().then(() => navigate("/")).catch(() => {
      navigate("/");
    });
  };

  return (
    <header className="bg-gradient-to-r from-yellow-400 via-red-500 to-blue-500 text-white shadow-lg sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="bg-white p-2 rounded-full">
              <span className="text-2xl">🍔</span>
            </div>
            <h1 className="text-2xl font-bold">PROA</h1>
          </Link>

          <nav className="flex items-center gap-4">
            {user && (
              <>
                <Link to="/cart">
                  <Button
                    variant="ghost"
                    className="relative text-white hover:bg-white/20"
                  >
                    <ShoppingCart className="h-5 w-5" />
                    {itemCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                        {itemCount}
                      </span>
                    )}
                  </Button>
                </Link>

                <Link to="/tracking">
                  <Button
                    variant="ghost"
                    className="text-white hover:bg-white/20"
                  >
                    <Package className="h-5 w-5 mr-2" />
                    Mis Pedidos
                  </Button>
                </Link>

                {isAdmin && (
                  <Link to="/admin">
                    <Button
                      variant="ghost"
                      className="text-white hover:bg-white/20"
                    >
                      <LayoutDashboard className="h-5 w-5 mr-2" />
                      Panel Admin
                    </Button>
                  </Link>
                )}

                <div className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  <span className="font-medium">
                    {user.nombre}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  onClick={handleLogout}
                  className="text-white hover:bg-white/20"
                >
                  <LogOut className="h-5 w-5" />
                </Button>
              </>
            )}

            {!user && (
              <Link to="/login">
                <Button
                  variant="ghost"
                  className="text-white hover:bg-white/20"
                >
                  <User className="h-5 w-5 mr-2" />
                  Iniciar Sesión
                </Button>
              </Link>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
};