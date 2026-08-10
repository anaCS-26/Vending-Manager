import AuthShell from "@/components/AuthShell"
import ForgotPasswordForm from "@/components/ForgotPasswordForm"

export const metadata = { title: "Reset password" }

export default function ForgotPasswordPage() {
    return (
        <AuthShell
            title="Reset password"
            subtitle="Admin accounts only. Drivers should ask an administrator to reset their PIN."
        >
            <ForgotPasswordForm />
        </AuthShell>
    )
}
