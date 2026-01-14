import { NextResponse } from "next/server";

import { getControlPlaneUrl } from "@/lib/control-plane";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const baseUrl = getControlPlaneUrl();
  if (!baseUrl) {
    return NextResponse.json({ error: "Missing CONTROL_PLANE_API_URL." }, { status: 500 });
  }
  try {
    const response = await fetch(`${baseUrl}/servers/${id}`, { method: "DELETE" });
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to reach control plane.", detail: String(error) },
      { status: 502 }
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const baseUrl = getControlPlaneUrl();
  if (!baseUrl) {
    return NextResponse.json({ error: "Missing CONTROL_PLANE_API_URL." }, { status: 500 });
  }
  try {
    const response = await fetch(`${baseUrl}/servers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: await request.text()
    });
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to reach control plane.", detail: String(error) },
      { status: 502 }
    );
  }
}

