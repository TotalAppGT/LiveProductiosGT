import { startCronManager } from "@/lib/cron-manager";

setTimeout(() => {
  try {
    startCronManager();
    console.log("[Cron] ✅ Iniciado automáticamente al cargar el módulo");
  } catch (err) {
    console.error("[Cron] ❌ Error al iniciar:", err);
  }
}, 1000);
