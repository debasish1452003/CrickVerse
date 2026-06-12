import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@crickverse/db";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Auth.js v5 — Google sign-in with database-backed (cookie) sessions via the
// Prisma adapter. Reads AUTH_SECRET + GOOGLE_CLIENT_ID/SECRET from the env.
// A dev fallback secret keeps the app from crashing before AUTH_SECRET is set;
// set a real AUTH_SECRET in .env for anything beyond local development.
const secret =
  process.env.AUTH_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  "crickverse-dev-only-secret-set-AUTH_SECRET-in-env";

export const { handlers, auth, signIn, signOut } = NextAuth({
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
