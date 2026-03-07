import LoginForm from "@/components/LoginForm"

export default function LoginPage() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-neo-bg flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background decoration to match the aesthetic */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-accent-blue/5 rounded-full blur-[120px] pointer-events-none" />
            <LoginForm />
        </div>
    )
}
