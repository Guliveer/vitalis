export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold">Vitalis</h1>
          <p className="text-muted-foreground mt-1">Personal System Monitoring</p>
        </div>
        {children}
      </div>
    </div>
  );
}
