"use client";
import type { LiveEvent } from "@gassetu/shared";
import { useEffect, useRef, useState } from "react";
import { WS_URL } from "./config";

type Handler = (e: LiveEvent) => void;
const handlers = new Set<Handler>();
let socket: WebSocket | null = null;
let retry = 0;
let status: "connecting" | "open" | "closed" = "closed";
const statusListeners = new Set<(s: typeof status) => void>();

function setStatus(s: typeof status) {
  status = s;
  statusListeners.forEach((l) => l(s));
}

function connect() {
  if (socket || typeof window === "undefined") return;
  setStatus("connecting");
  const ws = new WebSocket(WS_URL);
  socket = ws;
  ws.onopen = () => {
    retry = 0;
    setStatus("open");
  };
  ws.onmessage = (m) => {
    try {
      const data = JSON.parse(String(m.data));
      if (data?.type && data.type !== "hello" && data.type !== "pong") handlers.forEach((h) => h(data as LiveEvent));
    } catch {
      /* ignore */
    }
  };
  ws.onclose = () => {
    socket = null;
    setStatus("closed");
    setTimeout(connect, Math.min(8000, 1000 * 2 ** retry++));
  };
  ws.onerror = () => ws.close();
}

export function useLive(handler: Handler, deps: unknown[] = []) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    connect();
    const h: Handler = (e) => ref.current(e);
    handlers.add(h);
    return () => {
      handlers.delete(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function useLiveStatus() {
  const [s, setS] = useState(status);
  useEffect(() => {
    connect();
    statusListeners.add(setS);
    setS(status);
    return () => {
      statusListeners.delete(setS);
    };
  }, []);
  return s;
}
