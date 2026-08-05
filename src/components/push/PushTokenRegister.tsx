"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function PushTokenRegister() {
  const { user, token } = useAuth();
  const done = useRef(false);

  useEffect(() => {
    if (!user || !token || done.current) return;

    const params = new URLSearchParams(window.location.search);
    const pushToken = params.get("expoPushToken") || localStorage.getItem("expo_push_token");
    if (!pushToken) return;

    done.current = true;
    localStorage.setItem("expo_push_token", pushToken);

    fetch("/api/push/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ token: pushToken, platform: "expo" }),
    }).catch(() => {});
  }, [user, token]);

  return null;
}
