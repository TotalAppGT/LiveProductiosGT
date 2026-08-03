"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Settings,
  Shield,
  Activity,
  MessageCircle,
  Brain,
  Server,
  Key,
  CheckCircle2,
  XCircle,
  Clock,
  Database,
  Webhook,
  QrCode,
  Send,
  SlidersHorizontal,
  Filter,
  Cpu,
  Info,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/Tabs";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, cn } from "@/lib/utils";
import type { Activity as ActivityType, ApiResponse } from "@/types";

interface AISettings {
  id?: string;
  provider: string;
  apiKey: string;
  model: string;
  temperature: number;
}

interface WhatsAppSettings {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  businessPhone: string;
  webhookUrl: string;
}

interface TwilioSettings {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

interface SystemHealth {
  db: boolean;
  ai: boolean;
  whatsapp: boolean;
  firebase: boolean;
}

const AI_PROVIDERS = [
  { value: "DEEPSEEK", label: "DeepSeek", models: ["deepseek-chat", "deepseek-reasoner"] },
  { value: "OPENAI", label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"] },
  { value: "OPENROUTER", label: "OpenRouter", models: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet", "google/gemini-pro"] },
  { value: "NVIDIA", label: "NVIDIA NIM", models: ["meta/llama-3.3-70b-instruct", "nvidia/llama-3.1-nemotron-70b"] },
];

export default function AdminPage() {
  const { user, token } = useAuth();
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [activityFilter, setActivityFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [systemHealth, setSystemHealth] = useState<SystemHealth>({
    db: false,
    ai: false,
    whatsapp: false,
    firebase: false,
  });
  const [healthChecking, setHealthChecking] = useState(false);

  const [aiSettings, setAISettings] = useState<AISettings>({
    provider: "DEEPSEEK",
    apiKey: "",
    model: "deepseek-chat",
    temperature: 0.7,
  });
  const [aiSaving, setAISaving] = useState(false);
  const [aiTesting, setAITesting] = useState(false);

  const [whatsappSettings, setWhatsappSettings] = useState<WhatsAppSettings>({
    phoneNumberId: "",
    accessToken: "",
    verifyToken: "",
    businessPhone: "",
    webhookUrl: "",
  });
  const [whatsappSaving, setWhatsappSaving] = useState(false);
  const [whatsappTesting, setWhatsappTesting] = useState(false);
  const [testMessage, setTestMessage] = useState("");

  const [waProvider, setWaProvider] = useState<"META" | "TWILIO">("META");
  const [twilioSettings, setTwilioSettings] = useState<TwilioSettings>({
    accountSid: "",
    authToken: "",
    phoneNumber: "",
  });
  const [waProviderSaving, setWaProviderSaving] = useState(false);

  const canAccess = user?.role === "DUENO" || user?.role === "ADMIN";

  const fetchAISettings = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/ai-settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json: ApiResponse<AISettings & { id: string }> = await res.json();
        if (json.success && json.data) {
          setAISettings({
            provider: json.data.provider || "DEEPSEEK",
            model: json.data.model || "deepseek-chat",
            apiKey: json.data.apiKey ? "••••••••" : "",
            temperature: json.data.temperature ?? 0.7,
          });
        }
      }
    } catch {
      // silent
    }
  }, [token]);

  const fetchWhatsAppSettings = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/whatsapp-settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json: ApiResponse<WhatsAppSettings> = await res.json();
        if (json.success && json.data) {
          setWhatsappSettings({
            phoneNumberId: json.data.phoneNumberId || "",
            accessToken: json.data.accessToken ? "••••••••" : "",
            verifyToken: json.data.verifyToken || "",
            businessPhone: json.data.businessPhone || "",
            webhookUrl: json.data.webhookUrl || "",
          });
        }
      }
    } catch {
      // silent
    }
  }, [token]);

  const fetchWaProvider = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/system-config", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const configs = json.data as Array<{ key: string; value: string }>;
          const providerConfig = configs.find((c) => c.key === "whatsapp_provider");
          if (providerConfig) {
            setWaProvider(providerConfig.value === "TWILIO" ? "TWILIO" : "META");
          }
          const twilioSid = configs.find((c) => c.key === "twilio_account_sid");
          const twilioToken = configs.find((c) => c.key === "twilio_auth_token");
          const twilioPhone = configs.find((c) => c.key === "twilio_phone");
          setTwilioSettings({
            accountSid: twilioSid?.value ? "••••••••" : "",
            authToken: twilioToken?.value ? "••••••••" : "",
            phoneNumber: twilioPhone?.value || "",
          });
        }
      }
    } catch {
      // silent
    }
  }, [token]);

  const fetchActivities = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/activity", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) setActivities(json.data.slice(0, 100));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [token]);

  const checkSystemHealth = useCallback(async () => {
    if (!token) return;
    setHealthChecking(true);
    const health: SystemHealth = { db: false, ai: false, whatsapp: false, firebase: false };
    try {
      const dbRes = await fetch("/api/health/db", { headers: { Authorization: `Bearer ${token}` } });
      health.db = dbRes.ok;
    } catch { /* */ }
    try {
      const aiRes = await fetch("/api/health/ai", { headers: { Authorization: `Bearer ${token}` } });
      health.ai = aiRes.ok;
    } catch { /* */ }
    try {
      const waRes = await fetch("/api/health/whatsapp", { headers: { Authorization: `Bearer ${token}` } });
      health.whatsapp = waRes.ok;
    } catch { /* */ }
    health.firebase = true;
    setSystemHealth(health);
    setHealthChecking(false);
  }, [token]);

  useEffect(() => {
    if (canAccess) {
      fetchActivities();
      checkSystemHealth();
      fetchAISettings();
      fetchWhatsAppSettings();
      fetchWaProvider();
    }
  }, [canAccess, fetchActivities, checkSystemHealth, fetchAISettings, fetchWhatsAppSettings, fetchWaProvider]);

  async function saveAISettings() {
    if (!token) return;
    setAISaving(true);
    try {
      const body: Record<string, unknown> = {
        provider: aiSettings.provider,
        model: aiSettings.model,
        temperature: aiSettings.temperature,
      };
      if (aiSettings.apiKey && aiSettings.apiKey !== "••••••••") {
        body.apiKey = aiSettings.apiKey;
      }
      const res = await fetch("/api/admin/ai-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al guardar");
      toast.success(json.message || "Configuración de IA guardada");
      setAISettings((prev) => ({ ...prev, apiKey: "••••••••" }));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setAISaving(false);
    }
  }

  async function testAIConnection() {
    if (!token) return;
    setAITesting(true);
    try {
      const res = await fetch("/api/admin/ai-settings/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider: aiSettings.provider,
          apiKey: aiSettings.apiKey,
          model: aiSettings.model,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(`Conexión IA exitosa (${json.data.timingMs}ms)`);
        setSystemHealth((prev) => ({ ...prev, ai: true }));
      } else {
        throw new Error(json.error || "Error de conexión");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al probar conexión IA");
      setSystemHealth((prev) => ({ ...prev, ai: false }));
    } finally {
      setAITesting(false);
    }
  }

  async function saveWhatsAppSettings() {
    if (!token) return;
    setWhatsappSaving(true);
    try {
      const body: Record<string, unknown> = {
        businessPhone: whatsappSettings.businessPhone,
        verifyToken: whatsappSettings.verifyToken,
        webhookUrl: whatsappSettings.webhookUrl,
      };
      if (whatsappSettings.phoneNumberId) body.phoneNumberId = whatsappSettings.phoneNumberId;
      if (whatsappSettings.accessToken && whatsappSettings.accessToken !== "••••••••") {
        body.accessToken = whatsappSettings.accessToken;
      }
      if (waProvider === "META") {
        body.isActive = true;
      }

      const res = await fetch("/api/admin/whatsapp-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al guardar");

      setWhatsappSaving(false);

      if (waProvider === "TWILIO") {
        setWaProviderSaving(true);
        await saveTwilioConfig();
        setWaProviderSaving(false);
      }

      toast.success("Configuración de WhatsApp guardada");
      setWhatsappSettings((prev) => ({ ...prev, accessToken: "••••••••" }));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
      setWhatsappSaving(false);
    }
  }

  async function saveProvider(provider: "META" | "TWILIO") {
    if (!token) return;
    setWaProvider(provider);
    setWaProviderSaving(true);
    try {
      await fetch("/api/admin/system-config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          key: "whatsapp_provider",
          value: provider,
          description: "Proveedor de WhatsApp: META (Cloud API) o TWILIO",
        }),
      });
    } catch {
      toast.error("Error al cambiar proveedor");
    } finally {
      setWaProviderSaving(false);
    }
  }

  async function saveTwilioConfig() {
    const configs = [
      { key: "twilio_account_sid", value: twilioSettings.accountSid !== "••••••••" ? twilioSettings.accountSid : undefined, description: "Twilio Account SID" },
      { key: "twilio_auth_token", value: twilioSettings.authToken !== "••••••••" ? twilioSettings.authToken : undefined, description: "Twilio Auth Token" },
      { key: "twilio_phone", value: twilioSettings.phoneNumber, description: "Twilio WhatsApp Phone Number" },
    ];

    for (const cfg of configs) {
      if (cfg.value !== undefined && cfg.value !== "") {
        await fetch("/api/admin/system-config", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(cfg),
        });
      }
    }
    setTwilioSettings((prev) => ({
      ...prev,
      accountSid: "••••••••",
      authToken: "••••••••",
    }));
  }

  async function testWhatsAppMessage() {
    if (!token || !testMessage.trim()) {
      toast.error("Escribe un mensaje de prueba");
      return;
    }
    setWhatsappTesting(true);
    try {
      const res = await fetch("/api/admin/whatsapp-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: testMessage }),
      });
      if (res.ok) {
        toast.success("Mensaje de prueba enviado");
        setSystemHealth((prev) => ({ ...prev, whatsapp: true }));
      } else {
        throw new Error("Error al enviar");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al probar WhatsApp");
      setSystemHealth((prev) => ({ ...prev, whatsapp: false }));
    } finally {
      setWhatsappTesting(false);
    }
  }

  const filteredActivities = activityFilter
    ? activities.filter((a) =>
        a.action.toLowerCase().includes(activityFilter.toLowerCase()) ||
        (a.user?.name || "").toLowerCase().includes(activityFilter.toLowerCase()) ||
        (a.resource || "").toLowerCase().includes(activityFilter.toLowerCase())
      )
    : activities;

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
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="px-1">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Panel de Administración</h1>
        <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-1">
          Configuración y monitoreo del sistema
        </p>
      </div>

      <Tabs defaultValue="ai">
        <TabList className="overflow-x-auto flex-nowrap">
          <Tab value="ai">
            <span className="flex items-center gap-1.5">
              <Brain className="h-4 w-4" />
              <span className="hidden sm:inline">IA & Modelos</span>
            </span>
          </Tab>
          <Tab value="whatsapp">
            <span className="flex items-center gap-1.5">
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">WhatsApp</span>
            </span>
          </Tab>
          <Tab value="system">
            <span className="flex items-center gap-1.5">
              <Server className="h-4 w-4" />
              <span className="hidden sm:inline">Sistema</span>
            </span>
          </Tab>
          <Tab value="activity">
            <span className="flex items-center gap-1.5">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Actividad</span>
            </span>
          </Tab>
        </TabList>

        <TabPanel value="ai">
          <div className="space-y-6">
            <Card variant="bordered" className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className={cn(
                  "h-3 w-3 rounded-full",
                  systemHealth.ai ? "bg-green-500" : "bg-red-500"
                )} />
                <Brain className="h-6 w-6 text-purple-500" />
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Configuración de IA & Modelos
                </h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Proveedor de IA
                  </label>
                  <select
                    value={aiSettings.provider}
                    onChange={(e) => {
                      const provider = e.target.value;
                      const providerData = AI_PROVIDERS.find((p) => p.value === provider);
                      setAISettings((prev) => ({
                        ...prev,
                        provider,
                        model: providerData?.models[0] || prev.model,
                      }));
                    }}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {AI_PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>

                <Input
                  label="API Key"
                  type="password"
                  placeholder="sk-..."
                  value={aiSettings.apiKey}
                  onChange={(e) => setAISettings((prev) => ({ ...prev, apiKey: e.target.value }))}
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Modelo
                  </label>
                  <select
                    value={aiSettings.model}
                    onChange={(e) => setAISettings((prev) => ({ ...prev, model: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {(AI_PROVIDERS.find((p) => p.value === aiSettings.provider)?.models || []).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Temperatura: {aiSettings.temperature.toFixed(1)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={aiSettings.temperature}
                    onChange={(e) => setAISettings((prev) => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>Preciso (0)</span>
                    <span>Creativo (2)</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={testAIConnection}
                    isLoading={aiTesting}
                    leftIcon={<CheckCircle2 className="h-4 w-4" />}
                  >
                    Probar Conexión
                  </Button>
                  <Button
                    variant="primary"
                    onClick={saveAISettings}
                    isLoading={aiSaving}
                    leftIcon={<Cpu className="h-4 w-4" />}
                  >
                    Guardar Configuración
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </TabPanel>

        <TabPanel value="whatsapp">
          <div className="space-y-6">
            <Card variant="bordered" className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className={cn(
                  "h-3 w-3 rounded-full",
                  systemHealth.whatsapp ? "bg-green-500" : "bg-red-500"
                )} />
                <MessageCircle className="h-6 w-6 text-green-500" />
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Configuración de WhatsApp
                </h3>
              </div>

              <div className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-start gap-2">
                    <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-blue-700 dark:text-blue-400 space-y-2">
                      <p className="font-medium">Cómo obtener un número de WhatsApp Business:</p>
                      <p>
                        <strong>Meta (Facebook):</strong> Ve a{" "}
                        <a href="https://business.facebook.com" target="_blank" rel="noopener noreferrer" className="underline">
                          business.facebook.com
                        </a>{" "}
                        y crea una cuenta de negocio. Luego en{" "}
                        <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="underline">
                          Meta Developer Console
                        </a>{" "}
                        crea una app con WhatsApp. Necesitarás verificar tu negocio.
                      </p>
                      <p>
                        <strong>Twilio:</strong> Ve a{" "}
                        <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" className="underline">
                          console.twilio.com
                        </a>{" "}
                        y activa el sandbox de WhatsApp o solicita un número aprobado.
                      </p>
                      <p>Ambos proveedores requieren números de negocio verificados. No uses tu número personal.</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Proveedor de WhatsApp
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => saveProvider("META")}
                      className={cn(
                        "flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition-colors",
                        waProvider === "META"
                          ? "bg-blue-50 dark:bg-blue-900/30 border-blue-500 text-blue-700 dark:text-blue-300"
                          : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                      )}
                    >
                      Meta WhatsApp Cloud API
                    </button>
                    <button
                      type="button"
                      onClick={() => saveProvider("TWILIO")}
                      className={cn(
                        "flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition-colors",
                        waProvider === "TWILIO"
                          ? "bg-red-50 dark:bg-red-900/30 border-red-500 text-red-700 dark:text-red-300"
                          : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                      )}
                    >
                      Twilio WhatsApp
                    </button>
                  </div>
                  {waProviderSaving && (
                    <p className="text-xs text-gray-400 mt-1">Guardando proveedor...</p>
                  )}
                </div>

                {waProvider === "META" && (
                  <>
                    <Input
                      label="Phone Number ID"
                      placeholder="123456789012345"
                      value={whatsappSettings.phoneNumberId}
                      onChange={(e) => setWhatsappSettings((prev) => ({ ...prev, phoneNumberId: e.target.value }))}
                    />
                    <Input
                      label="Access Token"
                      type="password"
                      placeholder="EAA..."
                      value={whatsappSettings.accessToken}
                      onChange={(e) => setWhatsappSettings((prev) => ({ ...prev, accessToken: e.target.value }))}
                    />
                    <Input
                      label="Verify Token (Webhook)"
                      placeholder="tu-token-de-verificacion"
                      value={whatsappSettings.verifyToken}
                      onChange={(e) => setWhatsappSettings((prev) => ({ ...prev, verifyToken: e.target.value }))}
                    />
                  </>
                )}

                {waProvider === "TWILIO" && (
                  <>
                    <Input
                      label="Account SID"
                      placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      value={twilioSettings.accountSid}
                      onChange={(e) => setTwilioSettings((prev) => ({ ...prev, accountSid: e.target.value }))}
                    />
                    <Input
                      label="Auth Token"
                      type="password"
                      placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      value={twilioSettings.authToken}
                      onChange={(e) => setTwilioSettings((prev) => ({ ...prev, authToken: e.target.value }))}
                    />
                  </>
                )}

                <Input
                  label="Número de WhatsApp del Negocio"
                  placeholder="+502 5555-5555"
                  value={whatsappSettings.businessPhone}
                  onChange={(e) => setWhatsappSettings((prev) => ({ ...prev, businessPhone: e.target.value }))}
                />

                {waProvider === "TWILIO" && (
                  <Input
                    label="Número de WhatsApp (Twilio)"
                    placeholder="+14155238886"
                    value={twilioSettings.phoneNumber}
                    onChange={(e) => setTwilioSettings((prev) => ({ ...prev, phoneNumber: e.target.value }))}
                  />
                )}

                {waProvider === "META" && (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-3">
                      <Webhook className="h-5 w-5 text-blue-500" />
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Configuración del Webhook
                      </h4>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">URL del Webhook (copia esta URL en Meta Developer Console)</p>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded px-2 py-1.5 flex-1 break-all">
                            {whatsappSettings.webhookUrl || `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/whatsapp`}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const url = whatsappSettings.webhookUrl || `${window.location.origin}/api/webhooks/whatsapp`;
                              navigator.clipboard.writeText(url);
                              toast.success("URL copiada al portapapeles");
                            }}
                          >
                            Copiar
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <div className="flex-shrink-0 mt-0.5">
                          <Webhook className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="text-xs text-blue-700 dark:text-blue-400">
                          <p className="font-medium mb-1">Instrucciones:</p>
                          <ol className="list-decimal ml-3 space-y-0.5">
                            <li>Ve a Meta Developer Console &gt; WhatsApp &gt; Configuration</li>
                            <li>Pega la URL del webhook en el campo "Callback URL"</li>
                            <li>Ingresa el Verify Token configurado arriba</li>
                            <li>Suscríbete a los eventos "messages"</li>
                          </ol>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Probar envío de mensaje
                  </label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Mensaje de prueba..."
                      value={testMessage}
                      onChange={(e) => setTestMessage(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      variant="primary"
                      onClick={testWhatsAppMessage}
                      isLoading={whatsappTesting}
                      leftIcon={<Send className="h-4 w-4" />}
                    >
                      Enviar
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    variant="primary"
                    onClick={saveWhatsAppSettings}
                    isLoading={whatsappSaving || waProviderSaving}
                    leftIcon={<MessageCircle className="h-4 w-4" />}
                  >
                    Guardar Configuración
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </TabPanel>

        <TabPanel value="system">
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {[
                { label: "Base de Datos", icon: Database, ok: systemHealth.db },
                { label: "Inteligencia Artificial", icon: Brain, ok: systemHealth.ai },
                { label: "Firebase Auth", icon: Shield, ok: systemHealth.firebase },
                { label: "WhatsApp API", icon: MessageCircle, ok: systemHealth.whatsapp },
              ].map((item) => (
                <Card key={item.label} variant="bordered" className="p-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "h-10 w-10 rounded-lg flex items-center justify-center",
                        item.ok
                          ? "bg-green-500/10"
                          : "bg-red-500/10"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "h-5 w-5",
                          item.ok ? "text-green-500" : "text-red-500"
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {item.label}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        {item.ok ? (
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

            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={checkSystemHealth}
                isLoading={healthChecking}
                leftIcon={<Server className="h-4 w-4" />}
              >
                Verificar Todo
              </Button>
            </div>

            <Card variant="bordered" className="p-6">
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
                  <p className="text-gray-700 dark:text-gray-300">
                    {AI_PROVIDERS.find((p) => p.value === aiSettings.provider)?.label || "DeepSeek"} API
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Mensajería</p>
                  <p className="text-gray-700 dark:text-gray-300">
                    WhatsApp {waProvider === "TWILIO" ? "Twilio" : "Meta Cloud API"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">UI</p>
                  <p className="text-gray-700 dark:text-gray-300">Tailwind CSS 4 + Lucide Icons</p>
                </div>
              </div>
            </Card>
          </div>
        </TabPanel>

        <TabPanel value="activity">
          <div className="space-y-4">
            <div className="relative">
              <Filter className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Filtrar actividad..."
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value)}
                className="pl-10"
              />
            </div>

            {loading ? (
              <LoadingSpinner text="Cargando actividad..." />
            ) : filteredActivities.length === 0 ? (
              <EmptyState
                icon={<Activity className="h-16 w-16" />}
                title="Sin actividad"
                description="No hay registros de actividad para los filtros actuales."
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
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Detalles</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {filteredActivities.map((act) => (
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
                              {act.resourceId && (
                                <span className="text-gray-400 ml-1">#{act.resourceId.slice(0, 8)}</span>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-gray-400 max-w-[200px] truncate block">
                              {act.details || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-gray-400 flex items-center gap-1 whitespace-nowrap">
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
          </div>
        </TabPanel>
      </Tabs>
    </div>
  );
}
