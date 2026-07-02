"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getErrorMessage(response: Response, payload: unknown): string {
  if (isObject(payload) && typeof payload.error === "string") {
    return payload.error;
  }

  return `Request failed with status ${response.status}.`;
}

export function DestroyDialog({ onDestroyed }: { onDestroyed: () => void | Promise<void> }) {
  const [confirmed, setConfirmed] = useState(false);
  const [isDestroying, setIsDestroying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function destroy() {
    setError(null);
    setIsDestroying(true);

    try {
      const response = await fetch("/api/destroy", { method: "POST" });
      const payload = await readJson(response);

      if (!response.ok) {
        setError(getErrorMessage(response, payload));
        return;
      }
      await onDestroyed();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setIsDestroying(false);
    }
  }

  return (
    <div className="rounded-[1.75rem] border border-red-200 bg-red-50/90 p-5 shadow-[0_18px_40px_-34px_rgba(127,29,29,0.6)]">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-700">Destructive action</p>
      <h2 className="mt-2 text-lg font-semibold text-red-950">Destroy infrastructure</h2>
      <p className="mt-2 text-sm leading-6 text-red-900/80">
        Run <code className="rounded bg-red-100 px-1 py-0.5 text-xs">terraform destroy</code> against the local workspace.
      </p>
      <label className="mt-4 flex items-start gap-3 text-sm text-red-950" htmlFor="destroy-confirmation">
        <Checkbox
          id="destroy-confirmation"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.currentTarget.checked)}
        />
        <span>I understand this will run terraform destroy.</span>
      </label>
      <Button
        className="mt-4 border border-red-700 bg-red-600 shadow-none hover:bg-red-700"
        disabled={!confirmed || isDestroying}
        onClick={destroy}
        type="button"
      >
        {isDestroying ? "Destroying…" : "Destroy"}
      </Button>
      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-white/80 px-3 py-2 text-sm text-red-800" role="alert">
          <p className="font-medium">Destroy failed. Resolve the issue, then retry.</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
