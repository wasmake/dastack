import { Button, Text } from "@react-email/components";

import { BaseEmail, emailStyles } from "@/server/email/templates/base-email";

export function MagicLinkEmail({
  signInUrl,
  expiresIn,
}: {
  signInUrl: string;
  expiresIn: string;
}) {
  return (
    <BaseEmail preview="Your secure sign-in link" heading="Sign in to DaStack">
      <Text style={emailStyles.text}>
        Use this one-time link to sign in. It can only be used once.
      </Text>
      <Button href={signInUrl} style={emailStyles.button}>
        Sign in securely
      </Button>
      <Text style={emailStyles.muted}>
        This link expires in {expiresIn}. If you did not request it, do not use
        the link.
      </Text>
    </BaseEmail>
  );
}

MagicLinkEmail.PreviewProps = {
  signInUrl: "http://localhost:3000/login",
  expiresIn: "15 minutes",
};
export default MagicLinkEmail;
