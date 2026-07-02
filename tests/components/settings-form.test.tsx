import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsForm } from "@/components/settings/settings-form";

describe("SettingsForm", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          settings: { terraformPath: "terraform", gcloudPath: "gcloud", dockerPath: "docker" }
        }),
      ),
    );
  });

  it("saves local binary paths", async () => {
    const user = userEvent.setup();
    render(<SettingsForm />);

    await user.clear(await screen.findByLabelText("Terraform path"));
    await user.type(screen.getByLabelText("Terraform path"), "/opt/bin/terraform");
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/settings",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps default settings when loading fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "Unable to load settings." }, { status: 500 })),
    );

    render(<SettingsForm />);

    expect(await screen.findByDisplayValue("terraform")).toBeInTheDocument();
    expect(screen.getByDisplayValue("gcloud")).toBeInTheDocument();
    expect(screen.getByDisplayValue("docker")).toBeInTheDocument();
    expect(
      screen.getByText("/api/settings could not be loaded. Check the local settings API, then try again."),
    ).toBeInTheDocument();
    expect(screen.getByText("Unable to load settings.")).toBeInTheDocument();
  });

  it("keeps current settings when saving fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return Response.json({ error: "Unable to save settings." }, { status: 500 });
        }

        return Response.json({
          settings: { terraformPath: "terraform", gcloudPath: "gcloud", dockerPath: "docker" }
        });
      }),
    );

    render(<SettingsForm />);

    await user.clear(await screen.findByLabelText("Terraform path"));
    await user.type(screen.getByLabelText("Terraform path"), "/opt/bin/terraform");
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    expect(screen.getByDisplayValue("/opt/bin/terraform")).toBeInTheDocument();
    expect(
      await screen.findByText("/api/settings could not be saved. Check the local settings API, then try again."),
    ).toBeInTheDocument();
    expect(screen.getByText("Unable to save settings.")).toBeInTheDocument();
  });

  it("shows field-specific validation errors when saving fails with structured fieldErrors", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return Response.json(
            {
              error: {
                formErrors: [],
                fieldErrors: {
                  terraformPath: ["String must contain at least 1 character(s)"]
                }
              }
            },
            { status: 400 },
          );
        }

        return Response.json({
          settings: { terraformPath: "terraform", gcloudPath: "gcloud", dockerPath: "docker" }
        });
      }),
    );

    render(<SettingsForm />);

    await user.clear(await screen.findByLabelText("Terraform path"));
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    expect(
      await screen.findByText("Terraform path: String must contain at least 1 character(s)"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Request failed with status 400.")).not.toBeInTheDocument();
  });
});
