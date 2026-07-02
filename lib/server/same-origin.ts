const CROSS_ORIGIN_ERROR = "Cross-origin browser requests are not allowed.";

function getRejectedResponse() {
  return Response.json({ error: CROSS_ORIGIN_ERROR }, { status: 403 });
}

export function validateSameOriginMutationRequest(request: Request): Response | null {
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");

  if (origin !== null && origin !== expectedOrigin) {
    return getRejectedResponse();
  }

  const referer = request.headers.get("referer");
  if (referer !== null) {
    try {
      if (new URL(referer).origin !== expectedOrigin) {
        return getRejectedResponse();
      }
    } catch {
      return getRejectedResponse();
    }
  }

  return null;
}
