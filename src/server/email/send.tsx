import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReactElement } from "react";

import { render } from "@react-email/render";
import { Resend } from "resend";

import { EmailDeliveryModel } from "@/server/db/models";
import { connectMongoose } from "@/server/db/mongodb";
import { getServerEnv } from "@/server/env";
import { secureLogError } from "@/server/security/redact";

type SendEmailInput = {
  to: string;
  subject: string;
  template: string;
  react: ReactElement;
  userId?: string | null;
  organizationId?: string | null;
};

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function recipientDigest(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export async function sendTransactionalEmail(
  input: SendEmailInput,
): Promise<string> {
  const env = getServerEnv();
  await connectMongoose();
  const provider = env.EMAIL_ADAPTER;
  const delivery = (
    await EmailDeliveryModel.create([
      {
        organizationId: input.organizationId ?? null,
        userId: input.userId ?? null,
        template: input.template,
        recipientDigest: recipientDigest(input.to),
        provider,
        status: "pending",
      },
    ])
  )[0];

  const html = await render(input.react);
  const text = await render(input.react, { plainText: true });
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      let providerId: string;
      if (provider === "file") {
        await mkdir(env.EMAIL_DEV_DIR, { recursive: true, mode: 0o700 });
        const filePath = path.join(
          env.EMAIL_DEV_DIR,
          `${delivery._id.toString()}.html`,
        );
        await writeFile(filePath, html, { encoding: "utf8", mode: 0o600 });
        providerId = `file:${delivery._id.toString()}`;
      } else {
        const resend = new Resend(env.RESEND_API_KEY);
        const result = await resend.emails.send(
          {
            from: env.EMAIL_FROM,
            to: [input.to],
            subject: input.subject,
            html,
            text,
            ...(env.EMAIL_REPLY_TO ? { replyTo: env.EMAIL_REPLY_TO } : {}),
          },
          { idempotencyKey: `email/${delivery._id.toString()}` },
        );
        if (result.error || !result.data?.id)
          throw new Error(result.error?.name ?? "EMAIL_PROVIDER_ERROR");
        providerId = result.data.id;
      }

      await EmailDeliveryModel.updateOne(
        { _id: delivery._id },
        {
          $set: {
            status: "sent",
            providerId,
            sentAt: new Date(),
            lastAttemptAt: new Date(),
            attempts: attempt,
            errorCode: null,
          },
        },
      );
      return providerId;
    } catch (error) {
      lastError = error;
      const code =
        error instanceof Error ? error.name.slice(0, 80) : "EMAIL_SEND_FAILED";
      await EmailDeliveryModel.updateOne(
        { _id: delivery._id },
        {
          $set: {
            status: attempt === 3 ? "failed" : "pending",
            attempts: attempt,
            lastAttemptAt: new Date(),
            errorCode: code,
          },
        },
      );
      if (attempt < 3) await sleep(150 * 2 ** (attempt - 1));
    }
  }

  secureLogError("email.delivery_failed", lastError, {
    deliveryId: delivery._id.toString(),
    template: input.template,
  });
  throw new Error("Email delivery failed");
}
