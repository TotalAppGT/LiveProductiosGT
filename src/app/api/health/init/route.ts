import { NextResponse } from "next/server";
import { startCronManager } from "@/lib/cron-manager";

let initialized = false;

export async function GET() {
  if (!initialized) {
    initialized = true;
    startCronManager();
    console.log("[Health] Cron manager iniciado via health endpoint");
  }
  return NextResponse.json({ status: "ok", cron: "running" });
}
