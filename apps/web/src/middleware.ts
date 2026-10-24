import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("proposal_assistant_token")?.value;
  const { pathname } = request.nextUrl;

  // Root route "/"
  if (pathname === "/") {
    if (token) {
      return NextResponse.redirect(new URL("/projects", request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Protected application routes
  const isProtectedRoute =
    pathname.startsWith("/projects") || pathname.startsWith("/knowledge");

  if (!token && isProtectedRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // If authenticated user visits login page
  if (token && pathname === "/login") {
    return NextResponse.redirect(new URL("/projects", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/projects/:path*",
    "/knowledge/:path*",
  ],
};
