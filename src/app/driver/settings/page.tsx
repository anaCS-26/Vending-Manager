export const dynamic = 'force-dynamic';
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import DriverSettingsForm from "@/components/DriverSettingsForm";

export default async function DriverSettingsPage() {
    const session = await auth();
    if (!session?.user) redirect('/login');

    const role = (session.user as any).role;
    if (role !== 'driver') {
        // Admins shadowing the driver portal don't get a self-service PIN form —
        // they have their own admin password reset flow.
        redirect('/driver');
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-neo-bg sm:p-4 text-slate-900 dark:text-white">
            <div className="max-w-md mx-auto pt-4 sm:pt-0">
                <DriverSettingsForm driverName={session.user.name || "Driver"} />
            </div>
        </div>
    );
}
