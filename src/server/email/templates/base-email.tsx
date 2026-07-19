import type { ReactNode } from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export function BaseEmail(props: {
  preview: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{props.preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>DASTACK</Text>
          <Heading style={styles.heading}>{props.heading}</Heading>
          <Section>{props.children}</Section>
          <Hr style={styles.rule} />
          <Text style={styles.footer}>
            This is an automated security message from DaStack.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const emailStyles = {
  text: { color: "#29313d", fontSize: "15px", lineHeight: "24px" },
  button: {
    backgroundColor: "#172554",
    borderRadius: "6px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "15px",
    fontWeight: "600",
    padding: "12px 20px",
    textDecoration: "none",
  },
  muted: { color: "#667085", fontSize: "13px", lineHeight: "20px" },
} as const;

const styles = {
  body: {
    backgroundColor: "#f2f4f7",
    fontFamily: "Arial, sans-serif",
    margin: 0,
    padding: "32px 12px",
  },
  container: {
    backgroundColor: "#ffffff",
    border: "1px solid #e4e7ec",
    borderRadius: "10px",
    margin: "0 auto",
    padding: "32px",
    width: "100%",
    maxWidth: "560px",
  },
  brand: {
    color: "#172554",
    fontSize: "12px",
    fontWeight: "700",
    letterSpacing: "2px",
  },
  heading: {
    color: "#101828",
    fontSize: "25px",
    lineHeight: "32px",
    margin: "18px 0",
  },
  rule: { borderColor: "#e4e7ec", margin: "28px 0 20px" },
  footer: { color: "#98a2b3", fontSize: "12px", lineHeight: "18px" },
} as const;
