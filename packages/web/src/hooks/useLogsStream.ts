import { useEffect, useRef, useState } from "react";

export interface LogStreamEvent {
  id: string;
  category: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  username: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export function useLogsStream(
  getToken: (() => string | undefined) | undefined,
  onEvent?: (e: LogStreamEvent) => void
) {
  const [connected, setConnected] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const esRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!getToken) return;
    const token = getToken();
    if (!token) return;

    // EventSource não suporta headers — passa token via query param
    // O backend extrai via ExtractJwt.fromUrlQueryParameter("access_token")
    const url = `/api/logs/stream?access_token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("open", () => setConnected(true));
    es.addEventListener("error", () => setConnected(false));

    es.addEventListener("log", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as LogStreamEvent;
        setNewCount((c) => c + 1);
        onEventRef.current?.(data);
      } catch {
        // ignora evento malformado
      }
    });

    es.addEventListener("heartbeat", () => {
      // mantém conexão viva, sem ação
    });

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [getToken]);

  return { connected, newCount, resetCount: () => setNewCount(0) };
}
