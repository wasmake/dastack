"use client";

import { CheckCircle2, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function AcceptInvitation({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "pending" | "accepted" | "error">(
    "idle",
  );

  async function accept() {
    setState("pending");
    try {
      const response = await fetch("/api/organizations/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setState(response.ok ? "accepted" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "accepted") {
    return (
      <div className="space-y-5 text-center">
        <CheckCircle2
          className="mx-auto size-10 text-success"
          aria-hidden="true"
        />
        <Alert tone="success">The organization invitation was accepted.</Alert>
        <Button asChild className="w-full">
          <Link href="/dashboard">Open dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {state === "error" ? (
        <Alert tone="danger">
          This invitation is invalid, expired, revoked, or belongs to a
          different email address.
        </Alert>
      ) : (
        <Alert>
          Accepting adds your verified account to the organization with the role
          chosen by its owner.
        </Alert>
      )}
      <Button
        className="w-full"
        onClick={accept}
        disabled={state === "pending"}
      >
        {state === "pending" ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : null}
        Accept invitation
      </Button>
    </div>
  );
}
