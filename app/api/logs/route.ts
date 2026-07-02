import { getDeploymentEngine } from "@/lib/deployment/engine-instance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function GET() {
  try {
    const logs = await getDeploymentEngine().getLogs();
    return Response.json({ logs });
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
