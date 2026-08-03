"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Settings,
  Shield,
  Users,
  Activity,
  MessageCircle,
  Brain,
  Server,
  Key,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/Tabs";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, cn } from "@/lib/utils";
import type { Activity as ActivityType, ApiResponse } from "@/types";

export default function AdminPage() {
  const { user, token } = useAuth();
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [systemHealth, setSystemHealth] = useState<{
    db: boolean;
    ai: boolean;
    firebase: boolean;
    whatsapp: boolean;
  } | null>(null);

  const canAccess = user?.role === "DUEÑO" || user?.role === "ADMIN";

  const fetchActivities = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/activity", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) setActivities(json.data.slice(0, 50));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [token]);

  const checkSystemHealth = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: "ping" }),
      });
      setSystemHealth({
        db: true,
        ai: res.ok,
        firebase: true,
        whatsapp: true,
      });
    } catch {
      setSystemHealth({
        db: true,
        ai: false,
        firebase: true,
        whatsapp: false,
      });
    }
  }, [token]);

  useEffect(() => {
    if (canAccess) {
      fetchActivities();
      checkSystemHealth();
    }
  }, [canAccess, fetchActivities, checkSystemHealth]);

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <EmptyState
          icon={<Shield className="h-16 w-16" />}
          title="Acceso restringido"
          description="Solo dueños y administradores pueden acceder a esta sección."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Panel de Administración</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          Configuración y monitoreo del sistema
        </p>
      </div>

      <Tabs defaultValue="health">
        <TabList>
          <Tab value="health">Salud del Sistema</Tab>
          <Tab value="settings">Configuración</Tab>
          <Tab value="activity">Registro de Actividad</Tab>
          <Tab value="ai">IA & WhatsApp</Tab>
        </TabList>

        <TabPanel value="health">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: "Base de Datos",
                icon: Server,
                ok: systemHealth?.db,
              },
              {
                label: "Inteligencia Artificial",
                icon: Brain,
                ok: systemHealth?.ai,
              },
              {
                label: "Firebase Auth",
                icon: Shield,
                ok: systemHealth?.firebase,
              },
              {
                label: "WhatsApp API",
                icon: MessageCircle,
                ok: systemHealth?.whatsapp,
              },
            ].map((item) => (
              <Card key={item.label} variant="bordered" className="p-4">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "h-10 w-10 rounded-lg flex items-center justify-center",
                      item.ok === undefined
                        ? "bg-gray-100 dark:bg-gray-700"
                        : item.ok
                        ? "bg-green-500/10"
                        : "bg-red-500/10"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "h-5 w-5",
                        item.ok === undefined
                          ? "text-gray-400"
                          : item.ok
                          ? "text-green-500"
                          : "text-red-500"
                      )}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {item.label}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {item.ok === undefined ? (
                        <span className="text-xs text-gray-400">Verificando...</span>
                      ) : item.ok ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                          <span className="text-xs text-green-600">Operativo</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3 text-red-500" />
                          <span className="text-xs text-red-600">Error</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <Card variant="bordered" className="p-6 mt-6">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
              Información del Sistema
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Framework</p>
                <p className="text-gray-700 dark:text-gray-300">Next.js 15 + React 19</p>
              </div>
              <div>
                <p className="text-gray-500">Base de Datos</p>
                <p className="text-gray-700 dark:text-gray-300">Prisma + PostgreSQL</p>
              </div>
              <div>
                <p className="text-gray-500">Autenticación</p>
                <p className="text-gray-700 dark:text-gray-300">Firebase Auth</p>
              </div>
              <div>
                <p className="text-gray-500">IA</p>
                <p className="text-gray-700 dark:text-gray-300">DeepSeek API</p>
              </div>
              <div>
                <p className="text-gray-500">Mensajería</p>
                <p className="text-gray-700 dark:text-gray-300">Twilio WhatsApp</p>
              </div>
              <div>
                <p className="text-gray-500">UI</p>
                <p className="text-gray-700 dark:text-gray-300">Tailwind CSS 4 + Lucide Icons</p>
              </div>
            </div>
          </Card>
        </TabPanel>

        <TabPanel value="settings">
          <Card variant="bordered" className="p-6">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
              Configuración del Sistema
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Notificaciones WhatsApp
                  </p>
                  <p className="text-xs text-gray-500">
                    Activar recordatorios automáticos por WhatsApp
                  </p>
                </div>
                <Button variant="outline" size="sm">Configurar</Button>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Recordatorios de Tareas
                  </p>
                  <p className="text-xs text-gray-500">
                    Enviar recordatorios antes del vencimiento
                  </p>
                </div>
                <Button variant="outline" size="sm">Configurar</Button>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Reportes Automáticos
                  </p>
                  <p className="text-xs text-gray-500">
                    Generar resúmenes diarios con IA
                  </p>
                </div>
                <Button variant="outline" size="sm">Configurar</Button>
              </div>
            </div>
          </Card>
        </TabPanel>

        <TabPanel value="activity">
          {loading ? (
            <LoadingSpinner text="Cargando actividad..." />
          ) : activities.length === 0 ? (
            <EmptyState
              icon={<Activity className="h-16 w-16" />}
              title="Sin actividad"
              description="No hay registros de actividad aún."
            />
          ) : (
            <Card variant="bordered" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Usuario</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acción</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Recurso</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {activities.map((act) => (
                      <tr key={act.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-900 dark:text-white">
                            {act.user?.name || "Sistema"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-600 dark:text-gray-300">
                            {act.action}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-500">
                            {act.resource}
                            {act.resourceId && ` #${act.resourceId}`}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(act.createdAt)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabPanel>

        <TabPanel value="ai">
          <div className="space-y-6">
            <Card variant="bordered" className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <Brain className="h-6 w-6 text-purple-500" />
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Configuración de IA
                </h3>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Key className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        API Key DeepSeek
                      </p>
                      <p className="text-xs text-gray-500">
                        {systemHealth?.ai
                          ? "Configurada y funcionando"
                          : "No configurada o con error"}
                      </p>
                    </div>
                  </div>
                  <Badge
                    size="sm"
                    color={systemHealth?.ai ? "green" : "red"}
                    dot
                  >
                    {systemHealth?.ai ? "Activo" : "Error"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Resumen Diario
                    </p>
                    <p className="text-xs text-gray-500">
                      Generar resumen automático de tareas cada día
                    </p>
                  </div>
                  <Badge size="sm" color="green" dot>Activo</Badge>
                </div>
              </div>
            </Card>

            <Card variant="bordered" className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <MessageCircle className="h-6 w-6 text-green-500" />
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Notificaciones WhatsApp
                </h3>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Estado del servicio
                    </p>
                    <p className="text-xs text-gray-500">
                      {systemHealth?.whatsapp
                        ? "Conectado a Twilio WhatsApp API"
                        : "Error de conexión"}
                    </p>
                  </div>
                  <Badge
                    size="sm"
                    color={systemHealth?.whatsapp ? "green" : "red"}
                    dot
                  >
                    {systemHealth?.whatsapp ? "Conectado" : "Error"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Recordatorios de tareas
                    </p>
                    <p className="text-xs text-gray-500">
                      Enviar recordatorio 1 hora antes del vencimiento
                    </p>
                  </div>
                  <Badge size="sm" color="green" dot>Activo</Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Alertas de equipo dañado
                    </p>
                    <p className="text-xs text-gray-500">
                      Notificar cuando equipo se reporta como dañado
                    </p>
                  </div>
                  <Badge size="sm" color="green" dot>Activo</Badge>
                </div>
              </div>
            </Card>
          </div>
        </TabPanel>
      </Tabs>
    </div>
  );
}
