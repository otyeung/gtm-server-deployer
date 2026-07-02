import { getDeploymentEngine } from "@/lib/deployment/engine-instance";
import { DeploymentEngineError } from "@/lib/deployment/errors";
import { validateSameOriginMutationRequest } from "@/lib/server/same-origin";
import { z } from "zod";

export const runtime = "nodejs";

const applyRequestSchema = z.object({
  planId: z.string().min(1, "Plan ID is required."),
});

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function getErrorStatus(error: unknown): number {
  if (
    error instanceof DeploymentEngineError &&
    error.deploymentError.category === "invalid_input"
  ) {
    return 409;
  }

  return 500;
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

  const parsed = applyRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const state = await getDeploymentEngine().apply(parsed.data.planId);
    return Response.json({ state });
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: getErrorStatus(error) });
  }
}
