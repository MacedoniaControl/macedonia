import type { IconName } from "@/components/ui/Icon";

export type NavItem = {
  label: string;
  href: string;
  icon: IconName;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    title: "Resumen",
    items: [{ label: "Dashboard", href: "/admin/dashboard", icon: "dashboard" }],
  },
  {
    title: "Operación",
    items: [
      { label: "Cotizaciones", href: "/admin/quotes", icon: "quote" },
      { label: "Notas de entrega", href: "/admin/delivery-notes", icon: "delivery" },
      { label: "Ventas internas", href: "/admin/sales", icon: "sales" },
    ],
  },
  {
    title: "Inventario",
    items: [
      { label: "Productos y catálogo", href: "/admin/products", icon: "products" },
      { label: "Inventario", href: "/admin/inventory", icon: "inventory" },
      { label: "Cilindros y recargas", href: "/admin/cylinders", icon: "cylinder" },
      { label: "Importaciones", href: "/admin/imports", icon: "import" },
    ],
  },
  {
    title: "Finanzas",
    items: [
      { label: "Cuentas por cobrar", href: "/admin/receivables", icon: "receivable" },
      { label: "Cuentas por pagar", href: "/admin/payables", icon: "payable" },
      { label: "Compras", href: "/admin/purchases", icon: "purchase" },
    ],
  },
  {
    title: "Inteligencia",
    items: [
      { label: "Reportes", href: "/admin/reports", icon: "report" },
      { label: "ROI / Rentabilidad", href: "/admin/roi", icon: "roi" },
      { label: "Matrices administrativas", href: "/admin/matrices", icon: "matrix" },
    ],
  },
  {
    title: "Sistema",
    items: [
      { label: "Configuración", href: "/admin/settings", icon: "settings" },
      { label: "Usuarios y roles", href: "/admin/users", icon: "users" },
      { label: "Auditoría", href: "/admin/audit", icon: "audit" },
    ],
  },
];

export function findNavItem(pathname: string): NavItem | undefined {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        return item;
      }
    }
  }
  return undefined;
}
