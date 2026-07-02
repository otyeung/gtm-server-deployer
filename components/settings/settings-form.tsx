"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_LOCAL_SETTINGS, type LocalSettings } from "@/lib/schemas/settings";

export function SettingsForm() {
  const [settings, setSettings] = useState<LocalSettings>({ ...DEFAULT_LOCAL_SETTINGS });
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch("/api/settings")
      .then((response) => response.json())
      .then((data: { settings: LocalSettings }) => setSettings(data.settings));
  }, []);

  async function save() {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings)
    });

    setMessage(response.ok ? "Settings saved." : "Settings could not be saved.");
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
          {message ? <p className="text-sm text-slate-600">{message}</p> : null}
        </div>
      </div>
    </Card>
  );
}
