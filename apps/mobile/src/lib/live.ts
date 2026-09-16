import { useEffect, useRef } from "react";
import type { LiveEvent } from "@gassetu/shared";
import { getMode, onLocalEvent, onModeChange } from "./api";
import { WS_URL } from "./config";

type Handler = (e: LiveEvent) => void;
const handlers = new Set<Handler>();
let socket: WebSocket | null = null;
let localUnsub: (() => void) | null = null;
let retry = 0;
let started = false;

function dispatch(e: LiveEvent) {
  handlers.forEach((h) => {
    try {
      h(e);
    } catch (err) {
      console.warn("live handler", err);
    }
  });
}

function connectRemote() {
  if (socket) return;
  try {
    const ws = new WebSocket(WS_URL);
    socket = ws;
    ws.onmessage = (m) => {
      try {
        const data = JSON.parse(String(m.data));
        if (data?.type && data.type !== "hello" && data.type !== "pong") dispatch(data as LiveEvent);
      } catch {
        /* ignore */
      }
    };
    ws.onopen = () => (retry = 0);
    ws.onclose = () => {
      socket = null;
      if (getMode() === "remote") setTimeout(connectRemote, Math.min(8000, 1000 * 2 ** retry++));
    };
    ws.onerror = () => ws.close();
  } catch {
    socket = null;
  }
}

function connectLocal() {
  if (localUnsub) return;
  localUnsub = onLocalEvent(dispatch);
}

export function startLive() {
  if (started) return;
  started = true;
  const sync = () => {
    if (getMode() === "remote") {
      localUnsub?.();
      localUnsub = null;
      connectRemote();
    } else {
      socket?.close();
      socket = null;
      connectLocal();
    }
  };
  sync();
  onModeChange(sync);
}

/** Subscribe to live events for the lifetime of a component. */
export function useLive(handler: Handler, deps: unknown[] = []) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    startLive();
    const h: Handler = (e) => ref.current(e);
    handlers.add(h);
    return () => {
      handlers.delete(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
