import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { ROLES, type Role } from '@datos/shared';
import { z } from 'zod';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    role: Role;
  };
}

interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  accessToken: string;
}

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const authSecret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
if (!authSecret) {
  throw new Error('NEXTAUTH_SECRET is required');
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: authSecret,
  useSecureCookies: process.env.NODE_ENV === 'production',
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const response = await fetch(new URL('/auth/login', apiBase), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.data),
        });
        if (!response.ok) {
          return null;
        }

        const data = (await response.json()) as LoginResponse;
        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role,
          accessToken: data.accessToken,
        } satisfies AuthUser;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const authUser = user as AuthUser;
        token.id = authUser.id;
        token.role = authUser.role;
        token.accessToken = authUser.accessToken;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.accessToken === 'string') {
        session.accessToken = token.accessToken;
      }
      session.user.id = typeof token.id === 'string' ? token.id : '';
      session.user.role = isRole(token.role) ? token.role : 'CLIENTE_VIEWER';
      return session;
    },
  },
});

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.includes(value as Role);
}
