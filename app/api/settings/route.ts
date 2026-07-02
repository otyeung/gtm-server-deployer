import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getWorkspacePaths } from "@/lib/deployment/paths";
import { DEFAULT_LOCAL_SETTINGS, settingsSchema } from "@/lib/schemas/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

async function parseJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const raw = await readFile(getWorkspacePaths().settingsFile, "utf8");
    return Response.json({ settings: settingsSchema.parse(JSON.parse(raw)) });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return Response.json({ settings: DEFAULT_LOCAL_SETTINGS });
    }

    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const json = await parseJsonBody(request);
  if (json === null) {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = settingsSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const paths = getWorkspacePaths();
    await mkdir(path.dirname(paths.settingsFile), { recursive: true });
    await writeFile(paths.settingsFile, `${JSON.stringify(parsed.data, null, 2)}\n`, "utf8");
    return Response.json({ settings: parsed.data });
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
