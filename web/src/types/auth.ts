// Auth-related TypeScript types
// Uses Drizzle inferred types for database model alignment

import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type { users } from "@/lib/db/schema";

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type UserRole = "ADMIN" | "USER";

export interface JWTPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export interface AuthResponse {
  user: Omit<User, "password_hash">;
  token: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}
