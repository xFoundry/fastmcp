export function getControlPlaneUrl(): string | null {
  const raw = process.env.CONTROL_PLANE_API_URL ?? "";
  if (!raw) {
    return null;
  }
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw.replace(/\/$/, "");
  }
  const host = raw.includes(":") ? raw : `${raw}:8080`;
  return `http://${host}`.replace(/\/$/, "");
}

