import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@crickverse/db";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Auth.js v5 — Google sign-in with database-backed (cookie) sessions via the
// Prisma adapter. Reads AUTH_SECRET + GOOGLE_CLIENT_ID/SECRET from the env.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: { signIn: "/login" },
});
