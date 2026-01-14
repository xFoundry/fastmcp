import { NextResponse } from "next/server";

import { getControlPlaneUrl } from "@/lib/control-plane";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const baseUrl = getControlPlaneUrl();
  if (!baseUrl) {
    return NextResponse.json({ error: "Missing CONTROL_PLANE_API_URL." }, { status: 500 });
  }
  const response = await fetch(`${baseUrl}/servers/${id}/check`, { method: "POST" });
  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}

