export async function register() {
  try {
    const { startCronManager } = await import("@/lib/cron-manager");
    startCronManager();
    console.log("[Instrumentation] ✅ Cron manager iniciado exitosamente");
  } catch (err) {
    console.error("[Instrumentation] ❌ Error iniciando cron:", err);
  }
}
