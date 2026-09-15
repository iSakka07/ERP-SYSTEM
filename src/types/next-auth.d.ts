import "next-auth";

declare module "next-auth" {
  interface User {
    roleKey: string;
    roleName: string;
    permissions: string[];
  }
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      roleKey: string;
      roleName: string;
      permissions: string[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    roleKey: string;
    roleName: string;
    permissions: string[];
  }
}
