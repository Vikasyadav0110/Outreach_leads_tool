import LoginForm from "@/app/components/LoginForm";
import { getAuthConfig } from "@/lib/authStore";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <LoginForm defaultUsername={getAuthConfig().username} />
    </div>
  );
}
