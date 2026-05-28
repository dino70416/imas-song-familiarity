import { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: '帳號', type: 'text' },
        password: { label: '密碼', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          throw new Error('帳號與密碼為必填欄位。');
        }

        const user = await prisma.user.findUnique({
          where: { username: credentials.username }
        });

        if (!user) {
          throw new Error('帳號或密碼錯誤。');
        }

        const isPasswordValid = await bcrypt.compare(credentials.password, user.password);

        if (!isPasswordValid) {
          throw new Error('帳號或密碼錯誤。');
        }

        return {
          id: user.id,
          name: user.username,
          username: user.username,
          nickname: user.nickname,
          shareCode: user.shareCode,
          themeColor: user.themeColor,
          isPublic: user.isPublic,
          isPublicPitchRange: user.isPublicPitchRange,
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.nickname = (user as any).nickname;
        token.shareCode = (user as any).shareCode;
        token.themeColor = (user as any).themeColor;
        token.isPublic = (user as any).isPublic;
        token.isPublicPitchRange = (user as any).isPublicPitchRange;
      }
      if (trigger === 'update' && session) {
        if (session.nickname !== undefined) token.nickname = session.nickname;
        if (session.themeColor !== undefined) token.themeColor = session.themeColor;
        if (session.isPublic !== undefined) token.isPublic = session.isPublic;
        if (session.isPublicPitchRange !== undefined) token.isPublicPitchRange = session.isPublicPitchRange;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.username = token.username as string;
        session.user.nickname = token.nickname as string;
        session.user.shareCode = token.shareCode as string;
        session.user.themeColor = token.themeColor as string;
        session.user.isPublic = token.isPublic as boolean;
        session.user.isPublicPitchRange = token.isPublicPitchRange as boolean;
      }
      return session;
    }
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
