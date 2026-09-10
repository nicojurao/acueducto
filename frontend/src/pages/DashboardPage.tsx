import ReportesPage from "./ReportesPage";

// Antes vivía embebido dentro de Inicio para quien tuviera el permiso "dashboard" — se separó a
// su propia ruta/entrada de menú para que Inicio quede como una pantalla liviana (bienvenida +
// modo de salida + KPIs de inventario) y el dashboard de reportes/gráficas tenga su propio lugar.
export default function DashboardPage() {
  return <ReportesPage />;
}
