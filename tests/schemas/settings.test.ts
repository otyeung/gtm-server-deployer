import { DEFAULT_LOCAL_SETTINGS, settingsSchema } from "@/lib/schemas/settings";

describe("settingsSchema", () => {
  it("uses PATH based defaults", () => {
    expect(settingsSchema.parse({})).toEqual(DEFAULT_LOCAL_SETTINGS);
  });

  it("accepts explicit binary paths", () => {
    expect(
      settingsSchema.parse({
        terraformPath: "/opt/bin/terraform",
        gcloudPath: "/opt/bin/gcloud",
        dockerPath: "/opt/bin/docker"
      })
    ).toEqual({
      terraformPath: "/opt/bin/terraform",
      gcloudPath: "/opt/bin/gcloud",
      dockerPath: "/opt/bin/docker"
    });
  });
});
