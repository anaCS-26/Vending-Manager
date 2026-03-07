import { auth } from "@/auth";
import { redirect } from "next/navigation";
import ResetPasswordClient from "./ResetPasswordClient";

export default async function ResetPasswordPage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string }>;
}) {
    // If the user happens to be logged in, maybe log them out automatically, but normally they are not.
    const session = await auth();
    if (session?.user) {
        redirect('/admin');
    }

    const { token } = await searchParams;

    if (!token) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-neo-bg text-slate-900 dark:text-white flex items-center justify-center p-4">
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-2">Invalid or Missing Token</h1>
                    <p className="text-slate-500 mb-6">You must use the exact link sent to your email.</p>
                    <a href="/login" className="text-accent-blue font-bold hover:underline">Return to Login</a>
                </div>
            </div>
        )
    }

    return <ResetPasswordClient token={token} />;
}
