import { Text } from "@react-email/components";

import { BaseEmail, emailStyles } from "@/server/email/templates/base-email";

type OperationalEmailProps = {
  preview: string;
  heading: string;
  summary: string;
  detail?: string;
};

export function OperationalEmail({
  preview,
  heading,
  summary,
  detail,
}: OperationalEmailProps) {
  return (
    <BaseEmail preview={preview} heading={heading}>
      <Text style={emailStyles.text}>{summary}</Text>
      {detail ? <Text style={emailStyles.muted}>{detail}</Text> : null}
    </BaseEmail>
  );
}

export function SubscriptionConfirmationEmail(props: {
  planName: string;
  renewsAt: string;
}) {
  return (
    <OperationalEmail
      preview="Your subscription is active"
      heading="Subscription confirmed"
      summary={`${props.planName} is now active for your organization.`}
      detail={`The next renewal is scheduled for ${props.renewsAt}.`}
    />
  );
}

export function PaymentFailedEmail(props: {
  invoiceReference: string;
  retryAt?: string;
}) {
  return (
    <OperationalEmail
      preview="Payment action is required"
      heading="Payment failed"
      summary={`Payment for invoice ${props.invoiceReference} was not successful.`}
      detail={
        props.retryAt
          ? `Stripe will retry the payment at ${props.retryAt}. Update the payment method in Billing if needed.`
          : "Update the payment method in Billing to avoid service restrictions."
      }
    />
  );
}

export function SubscriptionCanceledEmail(props: { effectiveAt: string }) {
  return (
    <OperationalEmail
      preview="Your subscription was canceled"
      heading="Subscription canceled"
      summary={`Your subscription ends at ${props.effectiveAt}.`}
      detail="Resources remain governed by the retention policy shown in Billing."
    />
  );
}

export function ResourceLimitWarningEmail(props: {
  resource: string;
  used: string;
  limit: string;
}) {
  return (
    <OperationalEmail
      preview="A resource is nearing its limit"
      heading="Resource limit warning"
      summary={`${props.resource} usage is ${props.used} of ${props.limit}.`}
      detail="Review usage or change the plan before new provisioning is blocked."
    />
  );
}

export function DeploymentFailedEmail(props: {
  serviceName: string;
  deploymentId: string;
  reason: string;
}) {
  return (
    <OperationalEmail
      preview="A deployment failed"
      heading="Deployment failed"
      summary={`${props.serviceName} deployment ${props.deploymentId} did not complete.`}
      detail={props.reason}
    />
  );
}

export function BackupFailedEmail(props: {
  serviceName: string;
  backupId: string;
  reason: string;
}) {
  return (
    <OperationalEmail
      preview="A backup failed"
      heading="Backup failed"
      summary={`${props.serviceName} backup ${props.backupId} did not complete.`}
      detail={props.reason}
    />
  );
}

export function PublicIpAllocatedEmail(props: {
  address: string;
  region: string;
}) {
  return (
    <OperationalEmail
      preview="A public IP was allocated"
      heading="Public IP allocated"
      summary={`${props.address} is allocated in ${props.region}.`}
      detail="Assignment and billing details are available in Public IPs."
    />
  );
}

export function DomainVerificationInstructionsEmail(props: {
  hostname: string;
  recordType: string;
  recordName: string;
  recordValue: string;
}) {
  return (
    <OperationalEmail
      preview="Configure DNS to verify your domain"
      heading="Domain verification required"
      summary={`Create a ${props.recordType} record for ${props.hostname}.`}
      detail={`Name: ${props.recordName}. Value: ${props.recordValue}. DNS records do not include application ports.`}
    />
  );
}

export function DomainConfigurationCompletedEmail(props: {
  hostname: string;
  endpoint: string;
}) {
  return (
    <OperationalEmail
      preview="Your domain is active"
      heading="Domain configuration completed"
      summary={`${props.hostname} is verified and routed.`}
      detail={`Active endpoint: ${props.endpoint}`}
    />
  );
}

export function ServiceHealthDegradationEmail(props: {
  serviceName: string;
  health: string;
  observedAt: string;
}) {
  return (
    <OperationalEmail
      preview="A service health check degraded"
      heading="Service health degraded"
      summary={`${props.serviceName} is reporting ${props.health}.`}
      detail={`Observed at ${props.observedAt}. Review live health checks and container logs.`}
    />
  );
}

OperationalEmail.PreviewProps = {
  preview: "Operational notification",
  heading: "Platform notification",
  summary: "This preview demonstrates the shared operational email layout.",
  detail:
    "Production templates provide event-specific, persisted infrastructure details.",
};

export default OperationalEmail;
