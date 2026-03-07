export const dynamic = 'force-dynamic';
import prisma from "@/lib/prisma";
import SuperAdminsDashboard from "@/components/SuperAdminsDashboard";

export default async function SuperAdminsPage() {
    // Only fetch regular admins, not super admins
    const admins = await prisma.admin.findMany({
        where: { role: 'ADMIN' },
        select: { id: true, email: true, name: true, createdAt: true },
        orderBy: { createdAt: 'desc' }
    });

    return (
        <SuperAdminsDashboard admins={admins} />
    );
}

