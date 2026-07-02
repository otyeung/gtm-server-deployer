import { getDeploymentEngine } from "@/lib/deployment/engine-instance";

export const runtime = "nodejs";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function POST() {
  try {
    const state = await getDeploymentEngine().destroy();
    return Response.json({ state });
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
