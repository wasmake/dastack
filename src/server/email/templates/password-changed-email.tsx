import { Text } from "@react-email/components";

import { BaseEmail, emailStyles } from "@/server/email/templates/base-email";

export function PasswordChangedEmail({ changedAt }: { changedAt: string }) {
  return (
    <BaseEmail preview="Your password was changed" heading="Password changed">
      <Text style={emailStyles.text}>
        The password for your DaStack account was changed at {changedAt}. All
        existing sessions were signed out.
      </Text>
      <Text style={emailStyles.muted}>
        If you did not make this change, start account recovery immediately and
        contact support.
      </Text>
    </BaseEmail>
  );
}

PasswordChangedEmail.PreviewProps = { changedAt: "2026-07-19T12:00:00.000Z" };
export default PasswordChangedEmail;
