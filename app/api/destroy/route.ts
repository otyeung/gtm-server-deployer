import { getDeploymentEngine } from "@/lib/deployment/engine-instance";
import { validateSameOriginMutationRequest } from "@/lib/server/same-origin";

export const runtime = "nodejs";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function POST(request: Request) {
  const crossOriginResponse = validateSameOriginMutationRequest(request);
  if (crossOriginResponse) {
    return crossOriginResponse;
  }

  try {
    const state = await getDeploymentEngine().destroy();
    return Response.json({ state });
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
