import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    rememberSession?: boolean;
  }

  interface Session {
    user: DefaultSession["user"] & { id: string };
    sessionId: string;
    tokenVersion: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sessionId?: string;
    tokenVersion?: number;
  }
}
