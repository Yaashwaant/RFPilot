/**
 * Proposal Assistant – useJobStream Hook
 * Resilient SSE client handling token streaming, citations, heartbeats, and editor cell writes.
 */

import { useEffect, useRef } from "react";
import { EditorAdapter } from "../editor/EditorAdapter";
import { useFlowStore } from "../flow/flowStore";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useJobStream(adapter: EditorAdapter | null) {
  const jobId = useFlowStore((s) => s.jobId);
  const state = useFlowStore((s) => s.state);
  const answerAnchor = useFlowStore((s) => s.answerAnchor);
  const appendToken = useFlowStore((s) => s.appendToken);
  const setSources = useFlowStore((s) => s.setSources);
  const finishGeneration = useFlowStore((s) => s.finishGeneration);
  const setError = useFlowStore((s) => s.setError);

  const accumulatedTextRef = useRef<string>("");
  const writeThrottleTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (state !== "GENERATING" || !jobId) {
      return;
    }

    accumulatedTextRef.current = "";
    const eventSource = new EventSource(`${API_BASE}/api/jobs/${jobId}/stream`);

    eventSource.addEventListener("heartbeat", (e) => {
      // Heartbeat received
    });

    eventSource.addEventListener("sources", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.items) {
          setSources(data.items);
        }
      } catch (err) {
        console.error("Error parsing sources event:", err);
      }
    });

    eventSource.addEventListener("token", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.t) {
          appendToken(data.t);
          accumulatedTextRef.current += data.t;

          // Throttled in-situ write to cell (every 120ms) as specified in LLD
          if (!writeThrottleTimerRef.current && adapter && answerAnchor) {
            writeThrottleTimerRef.current = setTimeout(() => {
              adapter.writeCell(answerAnchor, accumulatedTextRef.current, {
                applyAiTint: true,
                wrapText: true,
              });
              writeThrottleTimerRef.current = null;
            }, 120);
          }
        }
      } catch (err) {
        console.error("Error parsing token event:", err);
      }
    });

    eventSource.addEventListener("done", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (writeThrottleTimerRef.current) {
          clearTimeout(writeThrottleTimerRef.current);
          writeThrottleTimerRef.current = null;
        }

        // Final authoritative write to cell with AI draft tint
        if (adapter && answerAnchor) {
          adapter.writeCell(answerAnchor, accumulatedTextRef.current, {
            applyAiTint: true,
            wrapText: true,
          });
        }

        finishGeneration(data.answerId, data.confidence, data.truncated);
      } catch (err) {
        console.error("Error parsing done event:", err);
      } finally {
        eventSource.close();
      }
    });

    eventSource.addEventListener("error", (e: any) => {
      let errMsg = "Answer generation halted.";
      try {
        if (e.data) {
          const data = JSON.parse(e.data);
          errMsg = data.message || data.code || errMsg;
        }
      } catch {}
      setError(errMsg);
      eventSource.close();
    });

    return () => {
      if (writeThrottleTimerRef.current) {
        clearTimeout(writeThrottleTimerRef.current);
      }
      eventSource.close();
    };
  }, [jobId, state, adapter, answerAnchor, appendToken, setSources, finishGeneration, setError]);
}
