export function getTrackingOrigin(url: string) {
  return new URL(url).origin;
}
