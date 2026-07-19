import { Button, Text } from "@react-email/components";

import { BaseEmail, emailStyles } from "@/server/email/templates/base-email";

export function PasswordResetEmail({
  resetUrl,
  expiresIn,
}: {
  resetUrl: string;
  expiresIn: string;
}) {
  return (
    <BaseEmail
      preview="Reset your DaStack password"
      heading="Reset your password"
    >
      <Text style={emailStyles.text}>
        A password reset was requested for your account.
      </Text>
      <Button href={resetUrl} style={emailStyles.button}>
        Reset password
      </Button>
      <Text style={emailStyles.muted}>
        This one-time link expires in {expiresIn}. If this was not you, no
        action is required.
      </Text>
    </BaseEmail>
  );
}

PasswordResetEmail.PreviewProps = {
  resetUrl: "http://localhost:3000/reset-password",
  expiresIn: "30 minutes",
};
export default PasswordResetEmail;
