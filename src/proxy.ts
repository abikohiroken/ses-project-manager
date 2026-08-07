import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

import { API_ERROR_DEFINITIONS } from "@/lib/api/errors";
import { fail } from "@/lib/api/response";

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  if (token) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    const definition = API_ERROR_DEFINITIONS.AUTH_REQUIRED;
    return NextResponse.json(fail("AUTH_REQUIRED", definition.message), {
      status: definition.status,
    });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set(
    "callbackUrl",
    `${req.nextUrl.pathname}${req.nextUrl.search}`,
  );
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!login|api/auth|api/health|api/webhooks/line|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
