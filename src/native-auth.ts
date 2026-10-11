export const nativeCallback = "remionotes://auth/callback";

export function parseNativeCallback(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== "remionotes:" ||
    url.host !== "auth" ||
    url.pathname !== "/callback" ||
    url.username ||
    url.password ||
    url.hash
  )
    return null;
  return {
    code: url.searchParams.get("code"),
    error: url.searchParams.has("error"),
  };
}
