"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export function DestroyDialog({ onDestroyed }: { onDestroyed: () => void | Promise<void> }) {
  const [confirmed, setConfirmed] = useState(false);
  const [isDestroying, setIsDestroying] = useState(false);

  async function destroy() {
    setIsDestroying(true);

    try {
      const response = await fetch("/api/destroy", { method: "POST" });
      if (response.ok) {
        await onDestroyed();
      }
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
    </div>
  );
}
