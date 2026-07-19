import { Button, Text } from "@react-email/components";

import { BaseEmail, emailStyles } from "@/server/email/templates/base-email";

export function VerifyEmail({
  verificationUrl,
  expiresIn,
}: {
  verificationUrl: string;
  expiresIn: string;
}) {
  return (
    <BaseEmail preview="Verify your email address" heading="Verify your email">
      <Text style={emailStyles.text}>
        Confirm this address to finish creating your account and enable password
        sign-in.
      </Text>
      <Button href={verificationUrl} style={emailStyles.button}>
        Verify email
      </Button>
      <Text style={emailStyles.muted}>
        This one-time link expires in {expiresIn}. If you did not request it,
        you can ignore this email.
      </Text>
    </BaseEmail>
  );
}

VerifyEmail.PreviewProps = {
  verificationUrl: "http://localhost:3000/verify-email",
  expiresIn: "24 hours",
};
export default VerifyEmail;
