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
  Maximize2,
  Minimize2,
  Bot,
  Mic,
  Sunrise,
  Sunset,
  Sun,
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
  { label: "¿Qué tengo que hacer hoy?", prompt: "¿Qué tareas tengo pendientes para hoy?" },
  { label: "¿Qué eventos hay esta semana?", prompt: "¿Cuáles son los eventos programados para esta semana y qué personal está asignado?" },
  { label: "¿Quién no ha completado sus tareas?", prompt: "¿Qué usuarios del equipo no han completado sus tareas asignadas?" },
  { label: "Resumen de cumplimiento", prompt: "Genera un resumen de cumplimiento del equipo con porcentajes y detalles por persona." },
  { label: "Tareas urgentes", prompt: "¿Cuáles son las tareas urgentes y vencidas? ¿Quién las tiene asignadas?" },
];

const NATURAL_LANGUAGE_HINTS = [
  "Prueba decir: \"pospon tarea 'revisar equipo' para mañana porque falta personal\"",
  "Prueba decir: \"crea tarea para Juan de revisar el sonido para el sábado\"",
  "Prueba decir: \"¿cuánto ha cobrado María?\"",
  "Prueba decir: \"¿quién no ha entrado hoy?\"",
];

function getTimeBasedSuggestions(): string[] {
  const hour = new Date().getHours();
  if (hour < 12) {
    return [
      "¿Qué tareas tengo para hoy?",
      "¿Cuáles son los eventos de esta semana?",
      "¿Quién tiene tareas pendientes?",
    ];
  } else if (hour < 18) {
    return [
      "¿Qué se completó hoy?",
      "¿Cuánto hemos cobrado?",
      "¿Hay tareas urgentes?",
    ];
  } else {
    return [
      "Resumen de lo completado hoy",
      "¿Qué falta por terminar?",
      "Planificar tareas para mañana",
    ];
  }
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "¡Buenos días!";
  if (hour < 18) return "¡Buenas tardes!";
  return "¡Buenas noches!";
}

function getTimeIcon() {
  const hour = new Date().getHours();
  if (hour < 12) return Sunrise;
  if (hour < 18) return Sun;
  return Sunset;
}

const LUNA_GREETING = () => {
  const hour = new Date().getHours();
  const greeting = getTimeGreeting();
  return `${greeting} Soy *LUNA*, tu asistente de inteligencia artificial de Live Productions. Estoy aquí para ayudarte con:

- Tus tareas diarias y pendientes
- Información de eventos próximos
- Cumplimiento del equipo
- Procesos de la empresa
- Planificación semanal

¿En qué puedo ayudarte hoy?`;
};

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
      content: LUNA_GREETING(),
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [aiInfo, setAIInfo] = useState<{ provider: string; model: string }>({ provider: "DeepSeek", model: "deepseek-chat" });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const timeIcon = getTimeIcon();
  const timeSuggestions = getTimeBasedSuggestions();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

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
            ? eJson.data.map((e: { name: string; date: string; status: string }) => ({
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
              DEEPSEEK: "DeepSeek",
              OPENAI: "OpenAI",
              OPENROUTER: "OpenRouter",
              NVIDIA: "NVIDIA NIM",
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
    setIsThinking(true);

    const thinkingInterval = setInterval(() => {
      setIsThinking((prev) => !prev);
    }, 500);

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
        content: "Lo siento, hubo un error al comunicarme con LUNA. Verifica tu conexión e intenta de nuevo.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      clearInterval(thinkingInterval);
      setIsThinking(false);
      setIsLoading(false);
      setShowSuggestions(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  const TimeIconComponent = timeIcon;

  return (
    <>
      <button
        onClick={toggleAIChat}
        className={cn(
          "fixed bottom-6 right-6 z-50 rounded-full shadow-xl flex items-center justify-center gap-2 transition-all duration-300 group",
          isOpen
            ? "h-14 w-14 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
            : "h-16 w-16 bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 hover:h-16 hover:w-[140px] px-4"
        )}
        title="LUNA - Controladora IA"
      >
        {isOpen ? (
          <X className="h-6 w-6 text-gray-700 dark:text-gray-300" />
        ) : (
          <>
            <Bot className="h-7 w-7 text-white" />
            <span className="hidden group-hover:inline text-sm font-semibold text-white whitespace-nowrap">
              LUNA AI
            </span>
            <span className="absolute -top-1 -right-1 h-5 w-5 bg-green-400 rounded-full border-2 border-white dark:border-gray-900">
              <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-75" />
            </span>
          </>
        )}
      </button>

      {isOpen && (
        <div
          className={cn(
            "fixed z-50 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden animate-slide-up",
            isFullscreen
              ? "inset-4 rounded-none sm:inset-6"
              : "bottom-24 right-6 w-[420px] max-w-[calc(100vw-2rem)] h-[650px] max-h-[calc(100vh-8rem)]"
          )}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-600 to-blue-600">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center ring-2 ring-white/30">
                <Bot className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1">
                  LUNA
                  <span className="text-[10px] bg-white/20 text-white/90 px-1.5 py-0.5 rounded-full font-normal">IA</span>
                </h3>
                <p className="text-xs text-purple-200 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Controladora de Live Productions · {aiInfo.provider}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className="flex h-2.5 w-2.5 rounded-full bg-green-400 animate-pulse" />
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                title={isFullscreen ? "Reducir" : "Pantalla completa"}
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                onClick={toggleAIChat}
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
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
                    <Bot className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-br-md"
                      : msg.id === "welcome"
                      ? "bg-purple-50 dark:bg-purple-900/20 text-gray-900 dark:text-white rounded-bl-md border border-purple-200 dark:border-purple-800"
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
                  <Bot className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mr-2">
                      {isThinking ? "LUNA está pensando..." : "LUNA está escribiendo..."}
                    </p>
                    <span className="h-2 w-2 bg-purple-400 dark:bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 bg-purple-400 dark:bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 bg-purple-400 dark:bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {messages.length <= 1 && showSuggestions && (
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
              <div className="flex items-center gap-2">
                <TimeIconComponent className="h-4 w-4 text-purple-500" />
                <p className="text-xs text-gray-500 font-medium">
                  {getTimeGreeting()} ¿En qué te ayudo?
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {timeSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => sendMessage(suggestion)}
                    className="px-3 py-2 text-xs rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40 border border-purple-200 dark:border-purple-800 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <p className="text-xs text-gray-400 flex items-center gap-1 w-full mb-1">
                  <Zap className="h-3 w-3 text-yellow-500" />
                  Preguntas frecuentes
                </p>
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => sendMessage(action.prompt)}
                    className="px-3 py-2 text-xs rounded-full bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 transition-colors"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 italic">
                {NATURAL_LANGUAGE_HINTS[Math.floor(Math.random() * NATURAL_LANGUAGE_HINTS.length)]}
              </p>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
          >
            <button
              type="button"
              className="p-2 rounded-full text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
              title="Entrada de voz (próximamente)"
              onClick={() => {}}
            >
              <Mic className="h-5 w-5" />
            </button>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu mensaje para LUNA..."
              disabled={isLoading}
              className="flex-1 rounded-full border-0 bg-white dark:bg-gray-700 px-4 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!input.trim() || isLoading}
              className="rounded-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500"
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
