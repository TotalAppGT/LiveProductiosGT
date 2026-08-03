"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  ClipboardCheck,
  Package,
  Users,
  DollarSign,
  Truck,
  Shield,
  LogOut,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import type { UserRole } from "@/types";

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  roles?: UserRole[];
}

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Tareas",
    href: "/tareas",
    icon: CheckSquare,
  },
  {
    label: "Cumplimiento",
    href: "/cumplimiento",
    icon: ClipboardCheck,
    roles: ["DUENO", "ADMIN", "JEFE"],
  },
  {
    label: "Eventos",
    href: "/eventos",
    icon: Calendar,
  },
  {
    label: "Inventario",
    href: "/inventario",
    icon: Package,
  },
  {
    label: "Personal",
    href: "/personal",
    icon: Users,
  },
  {
    label: "Cobros",
    href: "/cobros",
    icon: DollarSign,
  },
  {
    label: "Vehículos",
    href: "/vehiculos",
    icon: Truck,
  },
  {
    label: "Admin",
    href: "/admin",
    icon: Shield,
    roles: ["DUENO", "ADMIN"],
  },
];

function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarCollapsed, toggleSidebar, isMobile, setSidebarCollapsed } =
    useApp();
  const { user, logout } = useAuth();

  const filteredItems = navItems.filter((item) => {
    if (!item.roles) return true;
    return user ? item.roles.includes(user.role) : false;
  });

  function handleNavigate(href: string) {
    router.push(href);
    if (isMobile) {
      setSidebarCollapsed(true);
    }
  }

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  if (isMobile && sidebarCollapsed) return null;

  return (
    <>
      {isMobile && !sidebarCollapsed && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-screen flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-300",
          sidebarCollapsed ? "w-16" : "w-64",
          isMobile && sidebarCollapsed && "hidden",
          isMobile && "relative"
        )}
      >
        <div className="flex items-center h-16 px-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">LP</span>
            </div>
            {!sidebarCollapsed && (
              <span className="text-lg font-bold text-gray-900 dark:text-white truncate">
                Live Productions
              </span>
            )}
          </div>
          {isMobile ? (
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          ) : (
            <button
              onClick={toggleSidebar}
              className="hidden lg:flex p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition-colors"
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <ul className="space-y-1">
            {filteredItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <button
                    onClick={() => handleNavigate(item.href)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]",
                      active
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                        : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200",
                      sidebarCollapsed && "justify-center px-2"
                    )}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <Icon
                      className={cn(
                        "h-5 w-5 flex-shrink-0",
                        active && "text-blue-600 dark:text-blue-400"
                      )}
                    />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-gray-200 dark:border-gray-800 p-3">
          {user && (
            <div
              className={cn(
                "flex items-center gap-3",
                sidebarCollapsed && "justify-center"
              )}
            >
              <Avatar
                name={user.name}
                src={user.avatar}
                size="sm"
              />
              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {user.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {user.role === "DUENO"
                      ? "Dueño"
                      : user.role === "ADMIN"
                      ? "Administrador"
                      : user.role === "JEFE"
                      ? "Jefe"
                      : "Empleado"}
                  </p>
                </div>
              )}
              {!sidebarCollapsed && (
                <button
                  onClick={logout}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="Cerrar sesión"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

export { Sidebar };
