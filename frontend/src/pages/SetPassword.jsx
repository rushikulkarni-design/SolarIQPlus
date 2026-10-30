
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import {
  EmailAuthProvider,
  linkWithCredential,
  updatePassword,
} from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  LockKeyhole,
  CheckCircle2,
} from "lucide-react";

export default function SetPassword() {
  const { user, checking, hasFirebasePassword, clearPasswordReminder } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const firebaseUser = auth.currentUser;

    if (!firebaseUser || !firebaseUser.email) {
      setError(
        "Your Firebase session is missing. Sign in with Google again."
      );
      return;
    }

    if (!user || user === false) {
      setError(
        "Your SolarIQ+ session is missing. Sign in again before setting your password."
      );
      return;
    }

    setLoading(true);

    try {
      if (hasFirebasePassword) {
        await updatePassword(firebaseUser, password);
      } else {
        const credential = EmailAuthProvider.credential(
          firebaseUser.email,
          password
        );

        await linkWithCredential(firebaseUser, credential);
      }

      await api.post("/auth/set-password", { password });
      clearPasswordReminder?.();
      setSuccess(true);
    } catch (err) {
      const code = err?.code;

      if (code === "auth/weak-password") {
        setError("Choose a stronger password.");
      } else if (code === "auth/requires-recent-login") {
        setError(
          "For security, sign out and sign in with Google again, then retry."
        );
      } else if (code === "auth/credential-already-in-use") {
        setError(
          "This email/password credential is already linked to another Firebase account."
        );
      } else {
        setError(
          formatApiError(err?.response?.data?.detail) ||
            err?.message ||
            "Unable to save your password. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!user || user === false) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5">
        <div className="w-full max-w-md rounded-2xl border bg-white p-7">
          <h1 className="text-2xl font-bold">Sign in required</h1>
          <p className="mt-2 text-sm text-slate-600">
            Sign in to SolarIQ+ before setting a password.
          </p>
          <Button
            className="mt-5 w-full"
            onClick={() => navigate("/login")}
          >
            Go to login
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          {success ? (
            <CheckCircle2 className="h-6 w-6" />
          ) : (
            <LockKeyhole className="h-6 w-6" />
          )}
        </div>

        <h1 className="text-2xl font-bold text-slate-900">
          {success ? "Password saved successfully" : hasFirebasePassword ? "Change your password" : "Set your password"}
        </h1>

        <p className="mt-2 text-sm leading-6 text-slate-600">
          {success
            ? "Your password setup is complete. You can continue to your dashboard."
            : hasFirebasePassword
              ? "Update your password. Your Google sign-in will continue to work."
              : "Create a password for your existing account. Your Google sign-in will continue to work."}
        </p>

        {!success ? (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1.5"
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <Label htmlFor="confirm-password">
                Confirm password
              </Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(event.target.value)
                }
                className="mt-1.5"
                placeholder="Confirm your password"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Set password
            </Button>
          </form>
        ) : (
          <Button
            className="mt-6 w-full"
            onClick={() => navigate("/dashboard")}
          >
            Return to dashboard
          </Button>
        )}
      </section>
    </main>
  );
}
