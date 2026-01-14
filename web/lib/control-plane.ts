export function getControlPlaneUrl(): string | null {
  const raw = process.env.CONTROL_PLANE_API_URL ?? "";
  if (!raw) {
    return null;
  }
  const withScheme = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
  return withScheme.replace(/\/$/, "");
}

