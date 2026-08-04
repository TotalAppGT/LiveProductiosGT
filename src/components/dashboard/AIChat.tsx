"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Brain,
  X,
  Send,
  Sparkles,
  Loader2,
  MessageSquare,
  Zap,
  Mic,
  Maximize2,
  Minimize2,
  Cpu,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

const QUICK_ACTIONS = [
  { label: "Resumen de hoy", prompt: "Genera un resumen de las tareas y eventos del día de hoy." },
  { label: "Tareas atrasadas", prompt: "¿Qué tareas están atrasadas o pendientes? ¿Quién las tiene asignadas?" },
  { label: "¿Quién no ha entrado hoy?", prompt: "¿Qué usuarios no han iniciado sesión o no han completado tareas hoy?" },
  { label: "Eventos esta semana", prompt: "¿Cuáles son los eventos programados para esta semana y qué personal está asignado?" },
];

const SYSTEM_PROMPT = `Eres el asistente inteligente de Live Productions, una empresa guatemalteca de producción de eventos en vivo. La empresa se especializa en audio profesional, iluminación escénica, instrumentos musicales, DJ, mobiliario y producción completa de eventos sociales y corporativos.

ESTRUCTURA SEMANAL:
- Lunes: facturación y cotizaciones pendientes
- Martes: revisión de inventario y vehículos
- Miércoles: pagos y coordinación de músicos
- Jueves: preparación de eventos del fin de semana
- Viernes: carga de equipo y eventos del fin de semana
- Fines de semana: ejecución de eventos (bodas, quinceañeras, corporativos, conciertos)

PERSONAL CLAVE:
- Jorge (Dueño): dirección general
- Diana/Brenda (Coordinación): planificación, cotizaciones, clientes
- Abel (Logística): transporte, montaje/desmontaje
- Selvin (Técnico): audio, iluminación, mantenimiento
- Exequiel (Bodega): control de inventario, limpieza, organización

EQUIPO DE AUDIO: QSC (alta gama), T4/JBL (media), Turbosound (media)
UBICACIONES: Bodega Elgin, Bodega PP
TIPOS DE EVENTO: DJ COMPLETO, SAXOFONIC, SUNDAY FUNDAY
CICLO DE COBROS: depósitos pre-evento + saldo post-evento

Responde siempre en español, sé conciso y útil. Si necesitas más datos para ayudar, indícalo claramente.`;

interface AIChatContext {
  user: { name: string; role: string };
  todayTasks: { title: string; status: string; assignedTo?: string }[];
  upcomingEvents: { name: string; date: string; status: string }[];
  compliance?: { totalComplianceRate: number; activeUsers: number; inactiveUsers: number } | null;
  provider?: string;
  model?: string;
}

export function AIChat() {
  const { user, token } = useAuth();
  const { isAIChatOpen: isOpen, toggleAIChat } = useApp();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `¡Hola ${user?.name?.split(" ")[0] || ""}! Soy tu asistente inteligente de Live Productions. Puedo ayudarte con:\n\n• Resumen de tareas y eventos del día\n• Análisis de cumplimiento del equipo\n• Sugerencias de asignación de personal\n• Estado de cobros y facturación\n• Consultas sobre inventario y equipo\n\n¿En qué puedo ayudarte hoy?`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [aiInfo, setAIInfo] = useState<{ provider: string; model: string }>({ provider: "DeepSeek", model: "deepseek-chat" });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const fetchContext = useCallback(async (): Promise<AIChatContext> => {
    const ctx: AIChatContext = {
      user: { name: user?.name || "Usuario", role: user?.role || "EMPLEADO" },
      todayTasks: [],
      upcomingEvents: [],
    };
    if (!token) return ctx;

    try {
      const tRes = await fetch("/api/tasks?dueDate=today&limit=20", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (tRes.ok) {
        const tJson = await tRes.json();
        if (tJson.success && tJson.data) {
          ctx.todayTasks = tJson.data.map((t: { title: string; status: string; assignedTo?: { name: string } }) => ({
            title: t.title,
            status: t.status,
            assignedTo: t.assignedTo?.name,
          }));
        }
      }
    } catch { /* */ }

    try {
      const eRes = await fetch("/api/events/upcoming?limit=10", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (eRes.ok) {
        const eJson = await eRes.json();
        if (eJson.success && eJson.data) {
          ctx.upcomingEvents = Array.isArray(eJson.data)
            ? eJson.data.map((e: any) => ({
                name: e.name,
                date: e.date ? e.date.split("T")[0] : "",
                status: e.status,
              }))
            : [];
        }
      }
    } catch { /* */ }

    const isManager = user?.role === "DUENO" || user?.role === "ADMIN" || user?.role === "JEFE";
    if (isManager) {
      try {
        const cRes = await fetch("/api/compliance?filter=today", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cRes.ok) {
          const cJson = await cRes.json();
          if (cJson.success && cJson.data) {
            ctx.compliance = {
              totalComplianceRate: cJson.data.totalComplianceRate || 0,
              activeUsers: cJson.data.activeUsers || 0,
              inactiveUsers: cJson.data.inactiveUsers || 0,
            };
          }
        }
      } catch { /* */ }
    }

    return ctx;
  }, [token, user]);

  useEffect(() => {
    const loadAIInfo = async () => {
      if (!token) return;
      try {
        const res = await fetch("/api/admin/ai-settings", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            const providers: Record<string, string> = {
              deepseek: "DeepSeek",
              openai: "OpenAI",
              openrouter: "OpenRouter",
              nvidia: "NVIDIA NIM",
            };
            setAIInfo({
              provider: providers[json.data.provider] || json.data.provider || "DeepSeek",
              model: json.data.model || "deepseek-chat",
            });
          }
        }
      } catch { /* */ }
    };
    loadAIInfo();
  }, [token]);

  async function sendMessage(content: string) {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const context = await fetchContext();

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: content.trim(),
          systemPrompt: SYSTEM_PROMPT,
          context,
        }),
      });

      if (!res.ok) throw new Error("Error en la respuesta");

      const json = await res.json();
      const reply =
        json.success && json.data?.reply
          ? json.data.reply
          : "Lo siento, no pude procesar tu solicitud en este momento. Intenta de nuevo.";

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: reply,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Lo siento, hubo un error al comunicarme con el asistente. Verifica tu conexión e intenta de nuevo.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  return (
    <>
      <button
        onClick={toggleAIChat}
        className={cn(
          "fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300",
          isOpen
            ? "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
            : "bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500"
        )}
        title="Asistente IA"
      >
        {isOpen ? (
          <X className="h-6 w-6 text-gray-700 dark:text-gray-300" />
        ) : (
          <Brain className="h-6 w-6 text-white" />
        )}
        {!isOpen && (
          <span className="absolute -top-1 -right-1 h-4 w-4 bg-green-400 rounded-full border-2 border-white dark:border-gray-900 animate-pulse" />
        )}
      </button>

      {isOpen && (
        <div
          className={cn(
            "fixed z-50 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden animate-slide-up",
            isFullscreen
              ? "inset-4 rounded-none sm:inset-6"
              : "bottom-24 right-6 w-[380px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-8rem)]"
          )}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-600 to-blue-600">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-white" />
              <div>
                <h3 className="text-sm font-semibold text-white">Asistente IA</h3>
                <p className="text-xs text-purple-200 flex items-center gap-1">
                  {aiInfo.provider} · {aiInfo.model}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className="flex h-2 w-2 rounded-full bg-green-400" />
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                title={isFullscreen ? "Reducir" : "Pantalla completa"}
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                onClick={toggleAIChat}
                className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-2",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "assistant" && (
                  <div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0 mt-1">
                    <Brain className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-br-md"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-md"
                  )}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p
                    className={cn(
                      "text-xs mt-1",
                      msg.role === "user"
                        ? "text-blue-200"
                        : "text-gray-400 dark:text-gray-500"
                    )}
                  >
                    {msg.timestamp.toLocaleTimeString("es-GT", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                {msg.role === "user" && (
                  <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 mt-1">
                    <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-2 justify-start">
                <div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                  <Brain className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mr-2">Pensando...</p>
                    <span className="h-2 w-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {messages.length <= 1 && (
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                <Zap className="h-3 w-3 text-yellow-500" />
                Acciones rápidas
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => sendMessage(action.prompt)}
                    className="px-2.5 py-1.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700"
          >
            <button
              type="button"
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Nota de voz (próximamente)"
            >
              <Mic className="h-4 w-4" />
            </button>
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu mensaje..."
              disabled={isLoading}
              className="flex-1 border-0 bg-gray-100 dark:bg-gray-700 focus:ring-0"
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!input.trim() || isLoading}
              className="rounded-xl"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
