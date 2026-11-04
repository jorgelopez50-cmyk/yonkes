// Utilidad para inicializar datos de ejemplo en la aplicación
// Este archivo se ejecuta automáticamente cuando la app se carga por primera vez

export const initializeSampleData = () => {
  // Verificar si ya se inicializó
  if (localStorage.getItem('fastfood_initialized')) {
    return;
  }

  // No crear datos de muestra - la aplicación comienza limpia
  // Solo marcamos como inicializada
  localStorage.setItem('fastfood_initialized', 'true');
};
