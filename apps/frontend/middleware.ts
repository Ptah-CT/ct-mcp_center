import { NextRequest, NextResponse } from "next/server";

const locales = ["en", "zh"];
const defaultLocale = "en";

// Get the preferred locale from the request
function getLocale(request: NextRequest): string {
  // Check if there's a locale in the pathname
  const pathname = request.nextUrl.pathname;
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`,
  );

  if (pathnameHasLocale) {
    return pathname.split("/")[1] || defaultLocale;
  }

  // Check cookies for saved preference first (user's explicit choice)
  const savedLocale = request.cookies.get("preferred-language")?.value;
  if (savedLocale && locales.includes(savedLocale)) {
    return savedLocale;
  }

  // Check Accept-Language header as fallback
  const acceptLanguage = request.headers.get("accept-language");
  if (acceptLanguage) {
    // Simple language detection - look for zh in accept-language
    if (acceptLanguage.includes("zh")) {
      return "zh";
    }
  }

  return defaultLocale;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // CRITICAL: Skip middleware completely for proxy and API routes
  // This prevents i18n interference with proxy routing
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/trpc") ||
    pathname.startsWith("/mcp-proxy") ||
    pathname.startsWith("/metamcp") ||
    pathname.startsWith("/oauth") ||
    pathname.startsWith("/.well-known") ||
    pathname.startsWith("/service") ||
    pathname.startsWith("/health") ||
    pathname.startsWith("/fe-oauth") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Handle i18n routing first
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`,
  );

  let locale = defaultLocale;
  let pathnameWithoutLocale = pathname;

  if (pathnameHasLocale) {
    locale = pathname.split("/")[1] || defaultLocale;
    pathnameWithoutLocale = pathname.slice(locale.length + 1) || "/";
  } else {
    // Redirect to the appropriate locale
    locale = getLocale(request);
    const newUrl = new URL(`/${locale}${pathname}`, request.url);
    // Preserve query parameters during redirect
    newUrl.search = request.nextUrl.search;
    return NextResponse.redirect(newUrl);
  }

  // No authentication required - direct access to all routes
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip all internal paths (_next, etc.)
    "/((?!_next|api/|trpc|mcp-proxy|metamcp|oauth|fe-oauth|\.well-known|service|health|.*\..*).*)",
  ],
};
