"use client";

import { LoaderCircle } from "lucide-react";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function SocialButtons({
  githubEnabled,
  googleEnabled,
  callbackUrl,
}: {
  githubEnabled: boolean;
  googleEnabled: boolean;
  callbackUrl: string;
}) {
  const [provider, setProvider] = useState<"github" | "google" | null>(null);
  const [error, setError] = useState(false);

  async function continueWith(nextProvider: "github" | "google") {
    setProvider(nextProvider);
    setError(false);
    try {
      await signIn(nextProvider, { redirectTo: callbackUrl });
    } catch {
      setError(true);
      setProvider(null);
    }
  }

  return (
    <div>
      {error && (
        <Alert tone="danger" className="mb-3">
          Sign-in could not be started. Please try again.
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={provider !== null || !githubEnabled}
          onClick={() => continueWith("github")}
        >
          {provider === "github" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <span aria-hidden="true" className="text-[11px] font-bold">
              GH
            </span>
          )}{" "}
          GitHub
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={provider !== null || !googleEnabled}
          onClick={() => continueWith("google")}
        >
          {provider === "google" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <span aria-hidden="true" className="text-sm font-bold">
              G
            </span>
          )}{" "}
          Google
        </Button>
      </div>
      {(!githubEnabled || !googleEnabled) && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Unavailable providers require local OAuth credentials.
        </p>
      )}
    </div>
  );
}
