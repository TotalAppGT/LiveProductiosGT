"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import {
  Sparkles,
  ArrowRight,
  CheckSquare,
  Calendar,
  Package,
  Users,
  DollarSign,
  Truck,
  Brain,
} from "lucide-react";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-black">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black text-white">
      <nav className="flex items-center justify-between px-6 lg:px-12 py-5">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">
            Live Productions
          </span>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => router.push("/login")}
          rightIcon={<ArrowRight className="h-4 w-4" />}
        >
          Iniciar Sesión
        </Button>
      </nav>

      <main className="px-6 lg:px-12">
        <section className="max-w-4xl mx-auto pt-24 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-600/10 border border-blue-500/20 text-blue-400 text-sm mb-8">
            <Brain className="h-4 w-4" />
            Potenciado con Inteligencia Artificial
          </div>

          <h1 className="text-4xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight">
            Live Productions
            <br />
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Sistema de Gestión Inteligente
            </span>
          </h1>

          <p className="text-lg lg:text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            Optimiza la gestión de tu empresa de producciones en vivo con
            inteligencia artificial. Controla tareas, eventos, inventario,
            cobros y personal desde un solo lugar.
          </p>

          <Button
            variant="primary"
            size="lg"
            onClick={() => router.push("/login")}
            rightIcon={<ArrowRight className="h-5 w-5" />}
          >
            Comenzar Ahora
          </Button>
        </section>

        <section className="max-w-5xl mx-auto pb-16">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { icon: CheckSquare, label: "Tareas" },
              { icon: Calendar, label: "Eventos" },
              { icon: Package, label: "Inventario" },
              { icon: Users, label: "Personal" },
              { icon: DollarSign, label: "Cobros" },
              { icon: Truck, label: "Vehículos" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-3 p-6 rounded-xl bg-gray-800/50 border border-gray-700/50 hover:border-gray-600/50 transition-colors"
              >
                <Icon className="h-6 w-6 text-blue-400" />
                <span className="text-sm text-gray-300">{label}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-800 px-6 lg:px-12 py-8 text-center">
        <p className="text-gray-500 text-sm">
          &copy; {new Date().getFullYear()} Live Productions. Todos los derechos
          reservados.
        </p>
        <p className="text-gray-600 text-xs mt-1">
          Sistema de gestión empresarial inteligente
        </p>
      </footer>
    </div>
  );
}
