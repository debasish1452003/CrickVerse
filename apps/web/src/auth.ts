import type { Session } from "next-auth";
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

const defaultHandlers = {
  GET: async () => new Response("Not found", { status: 404 }),
  POST: async () => new Response("Not found", { status: 404 }),
};

let handlers = defaultHandlers;
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

  handlers = nextAuth.handlers;
  auth = nextAuth.auth;
  signIn = nextAuth.signIn;
  signOut = nextAuth.signOut;
}

export { handlers, auth, signIn, signOut };
