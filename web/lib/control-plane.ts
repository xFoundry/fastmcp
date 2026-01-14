export function getControlPlaneUrl(): string | null {
  const baseUrl = process.env.CONTROL_PLANE_API_URL ?? "";
  if (!baseUrl) {
    return null;
  }
  return baseUrl.replace(/\/$/, "");
}

