// POST /api/auth/logout — clears authentication cookies to log the user out

import { NextRequest } from "next/server";
import { successResponse, clearAuthCookies } from "@/lib/utils/response";

export async function POST(_request: NextRequest) {
  const response = successResponse({ message: "Logged out successfully" });
  return clearAuthCookies(response);
}
