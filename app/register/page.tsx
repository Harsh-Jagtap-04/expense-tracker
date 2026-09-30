import Link from 'next/link'
import { signup } from '@/app/actions/auth'

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>
}) {
  const { message } = await searchParams

  return (
    <main className="grid min-h-screen place-items-center bg-background px-5">
      <div className="w-full max-w-md">
        <div className="mb-10 flex justify-center">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <img src="/logo.png" alt="ExpenseTracker Logo" className="size-8 rounded-lg object-cover" />
            ExpenseTracker
          </Link>
        </div>
        <div className="rounded-2xl border border-border bg-card p-7 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Create an account.</h1>
          <p className="mt-2 text-sm text-muted-foreground">Start taking control of your finances today.</p>

          <form className="mt-7 space-y-4" action={signup}>
            <label className="block text-sm font-medium">
              Email
              <input
                name="email"
                type="email"
                required
                className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3"
                placeholder="you@example.com"
              />
            </label>
            <label className="block text-sm font-medium">
              Password
              <input
                name="password"
                type="password"
                required
                className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3"
                placeholder="••••••••"
              />
            </label>
            <label className="block text-sm font-medium">
              Retype Password
              <input
                name="confirmPassword"
                type="password"
                required
                className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3"
                placeholder="••••••••"
              />
            </label>
            
            {message && <p className="text-sm text-rose-500 mt-2">{message}</p>}

            <button type="submit" className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
              Sign up
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
