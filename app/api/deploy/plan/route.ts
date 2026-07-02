import { getDeploymentEngine } from "@/lib/deployment/engine-instance";
import { deploymentInputSchema } from "@/lib/schemas/deployment";
import { validateSameOriginMutationRequest } from "@/lib/server/same-origin";

export const runtime = "nodejs";

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

export async function POST(request: Request) {
  const crossOriginResponse = validateSameOriginMutationRequest(request);
  if (crossOriginResponse) {
    return crossOriginResponse;
  }

  const json = await parseJsonBody(request);
  if (json === null) {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = deploymentInputSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const state = await getDeploymentEngine().plan(parsed.data);
    return Response.json({ state, planId: state.lastSuccessfulPlanId });
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
