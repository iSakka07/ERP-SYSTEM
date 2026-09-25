import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ProfileEditor } from "@/components/profile-editor";

export default async function ProfilePage() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session!.user.id },
    select: { name: true, email: true, avatarMime: true },
  });
  return <ProfileEditor name={user.name} email={user.email} hasAvatar={Boolean(user.avatarMime)} />;
}
