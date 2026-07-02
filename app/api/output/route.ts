import { getDeploymentEngine } from "@/lib/deployment/engine-instance";
import type { TerraformOutputMap } from "@/lib/deployment/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function sanitizeOutputs(outputs: TerraformOutputMap): TerraformOutputMap {
  return Object.fromEntries(
    Object.entries(outputs).map(([key, output]) => [
      key,
      {
        ...output,
        value: output.sensitive ? "[REDACTED]" : output.value
      }
    ])
  );
}

export async function GET() {
  try {
    const outputs = await getDeploymentEngine().getOutputs();
    return Response.json({ outputs: sanitizeOutputs(outputs) });
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
