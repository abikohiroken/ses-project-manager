import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  secret: env.AUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.email) return false;

      const email = profile.email.trim().toLowerCase();
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return "/login?error=NOT_REGISTERED";
      if (!user.isActive) return "/login?error=INACTIVE";

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      return true;
    },
    async jwt({ token, account, profile }) {
      if (account && profile?.email) {
        const email = profile.email.trim().toLowerCase();
        const user = await prisma.user.findUnique({ where: { email } });
        if (user?.isActive) {
          token.userId = user.id;
          token.role = user.role;
          token.name = user.name;
          token.email = user.email;
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.userId && token.role) {
        session.user.id = token.userId;
        session.user.role = token.role;
      }
      return session;
    },
  },
};
