import type { Session } from "next-auth";
import type { NextRequest } from "next/server";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@crickverse/db";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const secret =
  process.env.AUTH_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  "crickverse-dev-only-secret-set-AUTH_SECRET-in-env";

const hasGoogleAuth =
  typeof process.env.GOOGLE_CLIENT_ID === "string" &&
  process.env.GOOGLE_CLIENT_ID.length > 0 &&
  typeof process.env.GOOGLE_CLIENT_SECRET === "string" &&
  process.env.GOOGLE_CLIENT_SECRET.length > 0;

type AuthHandlers = {
  GET: (req: NextRequest) => Promise<Response>;
  POST: (req: NextRequest) => Promise<Response>;
};

const defaultHandlers: AuthHandlers = {
  GET: async (_req) => new Response("Not found", { status: 404 }),
  POST: async (_req) => new Response("Not found", { status: 404 }),
};

let handlers: AuthHandlers = defaultHandlers;
let auth: () => Promise<Session | null> = async () => null;
let signIn: (...args: unknown[]) => Promise<unknown> = async () => {
  throw new Error("Authentication is not configured.");
};
let signOut: (...args: unknown[]) => Promise<unknown> = async () => {
  throw new Error("Authentication is not configured.");
};

if (hasGoogleAuth) {
  const nextAuth = NextAuth({
    adapter: PrismaAdapter(prisma),
    session: { strategy: "database" },
    secret,
    trustHost: true,
    providers: [
      Google({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      }),
    ],
    pages: { signIn: "/login" },
  });

  handlers = nextAuth.handlers as AuthHandlers;
  auth = nextAuth.auth;
  signIn = nextAuth.signIn;
  signOut = nextAuth.signOut;
}

export { handlers, auth, signIn, signOut };
