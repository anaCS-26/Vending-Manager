import AuthShell from "@/components/AuthShell"
import LoginForm from "@/components/LoginForm"

export default function LoginPage() {
    return (
        <AuthShell title="Vending Core" subtitle="Sign in to your route or your console.">
            <LoginForm />
        </AuthShell>
    )
}
