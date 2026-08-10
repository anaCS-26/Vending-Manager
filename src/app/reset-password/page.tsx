import Link from "next/link"
import AuthShell from "@/components/AuthShell"
import ResetPasswordForm from "@/components/ResetPasswordForm"

export const metadata = { title: "Choose a new password" }

export default async function ResetPasswordPage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string }>
}) {
    const { token } = await searchParams

    // No token at all is a user error (bookmarked/hand-typed URL), not a failed
    // redemption — handle it here so the form never renders without a capability.
    if (!token) {
        return (
            <AuthShell title="Invalid link" subtitle="This reset link is missing its token.">
                <div className="text-center">
                    <Link
                        href="/forgot-password"
                        className="text-xs font-bold uppercase tracking-widest text-accent-green hover:text-emerald-400 transition-colors"
                    >
                        Request a new link
                    </Link>
                </div>
            </AuthShell>
        )
    }

    return (
        <AuthShell title="New password" subtitle="Choose a password you have not used on this account before.">
            <ResetPasswordForm token={token} />
        </AuthShell>
    )
}
