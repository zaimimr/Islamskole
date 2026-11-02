const LOGIN_PATHS = /^\/(?:en\/)?(?:min-side\/logg-inn|min-side\/auth\/bekreft|login)(?:[/?#]|$)/;

export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (decoded.startsWith("//") || decoded.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\s\\]/.test(decoded.split(/[?#]/)[0])) return null;
  if (LOGIN_PATHS.test(value)) return null;
  return value;
}

export function resolvePostLoginPath(input: {
  next: string | null | undefined;
  isAdmin: boolean;
  locale: string;
}): string {
  const next = safeNextPath(input.next);
  if (next) return next;
  if (input.isAdmin) return "/admin/dagsplan";
  return input.locale === "en" ? "/en/min-side" : "/min-side";
}
