export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCronManager } = await import("@/lib/cron-manager");
    startCronManager();
    console.log("[Instrumentation] Cron manager registrado al iniciar");
  }
}
