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

type SettingsField = keyof LocalSettings;

type FieldErrorMap = Partial<Record<SettingsField, string[]>>;

type SettingsRequestError = {
  detail: string | null;
  fieldErrors: FieldErrorMap;
};

type SettingsRequestResult = {
  settings: LocalSettings | null;
  error: SettingsRequestError | null;
};

type FeedbackState =
  | {
      tone: "success" | "error";
      summary: string;
      detail?: string;
    }
  | null;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function getFieldLabel(field: SettingsField): string {
  switch (field) {
    case "terraformPath":
      return "Terraform path";
    case "gcloudPath":
      return "gcloud path";
    case "dockerPath":
      return "Docker path";
  }
}

function getFieldErrors(value: unknown): FieldErrorMap {
  if (!isObject(value) || !isObject(value.fieldErrors)) {
    return {};
  }

  const fieldErrors = value.fieldErrors as Record<string, unknown>;

  return (Object.keys(fieldErrors) as SettingsField[]).reduce<FieldErrorMap>((accumulator, field) => {
    if (isStringArray(fieldErrors[field])) {
      accumulator[field] = fieldErrors[field];
    }

    return accumulator;
  }, {});
}

function getRequestError(response: Response, payload: unknown): SettingsRequestError {
  if (isObject(payload) && "error" in payload) {
    const error = (payload as SettingsResponse).error;

    if (typeof error === "string") {
      return { detail: error, fieldErrors: {} };
    }

    if (isObject(error)) {
      const fieldErrors = getFieldErrors(error);
      const detail = isStringArray(error.formErrors) ? error.formErrors.join(" ") : null;
      return { detail, fieldErrors };
    }
  }

  return {
    detail: `Request failed with status ${response.status}.`,
    fieldErrors: {}
  };
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
      return { settings: null, error: getRequestError(response, payload) };
    }

    const parsed = settingsSchema.safeParse((payload as SettingsResponse | null)?.settings);
    if (!parsed.success) {
      return {
        settings: null,
        error: {
          detail: "Response did not include valid settings.",
          fieldErrors: {}
        }
      };
    }

    return { settings: parsed.data, error: null };
  } catch (error) {
    return {
      settings: null,
      error: {
        detail: error instanceof Error ? error.message : "Unknown error",
        fieldErrors: {}
      }
    };
  }
}

export function SettingsForm() {
  const [settings, setSettings] = useState<LocalSettings>({ ...DEFAULT_LOCAL_SETTINGS });
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});

  function updateSetting(field: SettingsField, value: string) {
    setSettings((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  useEffect(() => {
    let isActive = true;

    async function loadSettings() {
      const result = await requestSettings("/api/settings");
      if (!isActive) {
        return;
      }

      if (result.settings) {
        setSettings(result.settings);
        setFieldErrors({});
        setFeedback(null);
        return;
      }

      setFeedback({
        tone: "error",
        summary: "/api/settings could not be loaded. Check the local settings API, then try again.",
        detail: result.error?.detail ?? undefined
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
      setFieldErrors({});
      setFeedback({ tone: "success", summary: "Settings saved." });
      return;
    }

    setFieldErrors(result.error?.fieldErrors ?? {});
    setFeedback({
      tone: "error",
      summary: "/api/settings could not be saved. Check the local settings API, then try again.",
      detail: result.error?.detail ?? undefined
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
            aria-describedby={fieldErrors.terraformPath ? "terraformPath-error" : undefined}
            aria-invalid={fieldErrors.terraformPath ? true : undefined}
            onChange={(event) => updateSetting("terraformPath", event.currentTarget.value)}
            value={settings.terraformPath}
          />
          {fieldErrors.terraformPath ? (
            <div className="mt-1 space-y-1 text-sm text-red-700" id="terraformPath-error">
              {fieldErrors.terraformPath.map((message) => (
                <p key={message}>
                  {getFieldLabel("terraformPath")}: {message}
                </p>
              ))}
            </div>
          ) : null}
        </div>
        <div>
          <Label htmlFor="gcloudPath">gcloud path</Label>
          <Input
            id="gcloudPath"
            aria-describedby={fieldErrors.gcloudPath ? "gcloudPath-error" : undefined}
            aria-invalid={fieldErrors.gcloudPath ? true : undefined}
            onChange={(event) => updateSetting("gcloudPath", event.currentTarget.value)}
            value={settings.gcloudPath}
          />
          {fieldErrors.gcloudPath ? (
            <div className="mt-1 space-y-1 text-sm text-red-700" id="gcloudPath-error">
              {fieldErrors.gcloudPath.map((message) => (
                <p key={message}>
                  {getFieldLabel("gcloudPath")}: {message}
                </p>
              ))}
            </div>
          ) : null}
        </div>
        <div>
          <Label htmlFor="dockerPath">Docker path</Label>
          <Input
            id="dockerPath"
            aria-describedby={fieldErrors.dockerPath ? "dockerPath-error" : undefined}
            aria-invalid={fieldErrors.dockerPath ? true : undefined}
            onChange={(event) => updateSetting("dockerPath", event.currentTarget.value)}
            value={settings.dockerPath}
          />
          {fieldErrors.dockerPath ? (
            <div className="mt-1 space-y-1 text-sm text-red-700" id="dockerPath-error">
              {fieldErrors.dockerPath.map((message) => (
                <p key={message}>
                  {getFieldLabel("dockerPath")}: {message}
                </p>
              ))}
            </div>
          ) : null}
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
