import { Button, Text } from "@react-email/components";

import { BaseEmail, emailStyles } from "@/server/email/templates/base-email";

export function OrganizationInvitationEmail(props: {
  acceptUrl: string;
  organizationName: string;
  inviterName: string;
  roleName: string;
  expiresIn: string;
}) {
  return (
    <BaseEmail
      preview={`You were invited to ${props.organizationName}`}
      heading={`Join ${props.organizationName}`}
    >
      <Text style={emailStyles.text}>
        {props.inviterName} invited you to join as {props.roleName}.
      </Text>
      <Button href={props.acceptUrl} style={emailStyles.button}>
        Accept invitation
      </Button>
      <Text style={emailStyles.muted}>
        This one-time invitation expires in {props.expiresIn}. Only the invited
        email address can accept it.
      </Text>
    </BaseEmail>
  );
}

OrganizationInvitationEmail.PreviewProps = {
  acceptUrl: "http://localhost:3000/invitations/accept",
  organizationName: "Northstar Labs",
  inviterName: "Ada Lovelace",
  roleName: "Developer",
  expiresIn: "7 days",
};
export default OrganizationInvitationEmail;
