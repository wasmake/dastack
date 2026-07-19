import { Text } from "@react-email/components";

import { BaseEmail, emailStyles } from "@/server/email/templates/base-email";

export function WelcomeEmail({ name }: { name?: string | null }) {
  return (
    <BaseEmail preview="Welcome to DaStack" heading="Your account is ready">
      <Text style={emailStyles.text}>
        Welcome{name ? `, ${name}` : ""}. Your verified DaStack account is ready
        to use.
      </Text>
      <Text style={emailStyles.muted}>
        You can now create an organization or accept an invitation from your
        team.
      </Text>
    </BaseEmail>
  );
}

WelcomeEmail.PreviewProps = { name: "Ada Lovelace" };
export default WelcomeEmail;
