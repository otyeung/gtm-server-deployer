"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_LOCAL_SETTINGS, settingsSchema, type LocalSettings } from "@/lib/schemas/settings";

type SettingsResponse = {
  settings?: unknown;
  error?: unknown;
};

type SettingsRequestResult = {
  settings: LocalSettings | null;
  error: string | null;
};

type FeedbackState =
  | {
      tone: "success" | "error";
      summary: string;
      detail?: string;
    }
  | null;

function getErrorMessage(response: Response, payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof (payload as SettingsResponse).error === "string"
  ) {
    return (payload as SettingsResponse).error as string;
  }

  return `Request failed with status ${response.status}.`;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestSettings(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<SettingsRequestResult> {
  try {
    const response = await fetch(input, init);
    const payload = await readJson(response);

    if (!response.ok) {
      return { settings: null, error: getErrorMessage(response, payload) };
    }

    const parsed = settingsSchema.safeParse((payload as SettingsResponse | null)?.settings);
    if (!parsed.success) {
      return { settings: null, error: "Response did not include valid settings." };
    }

    return { settings: parsed.data, error: null };
  } catch (error) {
    return {
      settings: null,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

export function SettingsForm() {
  const [settings, setSettings] = useState<LocalSettings>({ ...DEFAULT_LOCAL_SETTINGS });
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  useEffect(() => {
    let isActive = true;

    async function loadSettings() {
      const result = await requestSettings("/api/settings");
      if (!isActive) {
        return;
      }

      if (result.settings) {
        setSettings(result.settings);
        setFeedback(null);
        return;
      }

      setFeedback({
        tone: "error",
        summary: "/api/settings could not be loaded. Check the local settings API, then try again.",
        detail: result.error ?? undefined
      });
    }

    void loadSettings();

    return () => {
      isActive = false;
    };
  }, []);

  async function save() {
    const result = await requestSettings("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings)
    });

    if (result.settings) {
      setSettings(result.settings);
      setFeedback({ tone: "success", summary: "Settings saved." });
      return;
    }

    setFeedback({
      tone: "error",
      summary: "/api/settings could not be saved. Check the local settings API, then try again.",
      detail: result.error ?? undefined
    });
  }

  return (
    <Card className="max-w-3xl overflow-hidden border-slate-900 bg-white p-0">
      <div className="border-b border-slate-200 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(30,41,59,0.9)_60%,rgba(37,99,235,0.74))] px-6 py-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-200">Local toolchain</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">Binary path settings</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          Override Terraform, gcloud, and Docker executable paths when your workstation differs from the default shell environment.
        </p>
      </div>
      <div className="space-y-5 p-6">
        <div>
          <Label htmlFor="terraformPath">Terraform path</Label>
          <Input
            id="terraformPath"
            onChange={(event) => setSettings({ ...settings, terraformPath: event.currentTarget.value })}
            value={settings.terraformPath}
          />
        </div>
        <div>
          <Label htmlFor="gcloudPath">gcloud path</Label>
          <Input
            id="gcloudPath"
            onChange={(event) => setSettings({ ...settings, gcloudPath: event.currentTarget.value })}
            value={settings.gcloudPath}
          />
        </div>
        <div>
          <Label htmlFor="dockerPath">Docker path</Label>
          <Input
            id="dockerPath"
            onChange={(event) => setSettings({ ...settings, dockerPath: event.currentTarget.value })}
            value={settings.dockerPath}
          />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button onClick={save} type="button">
            Save settings
          </Button>
          {feedback ? (
            <div
              className={feedback.tone === "error" ? "text-sm text-red-700" : "text-sm text-slate-600"}
              role={feedback.tone === "error" ? "alert" : undefined}
            >
              <p>{feedback.summary}</p>
              {feedback.detail ? <p className="mt-1">{feedback.detail}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
