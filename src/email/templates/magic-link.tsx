// The @react-email/components module is injected at runtime by
// magic-link-lazy.ts (which has already probed that the optional peer is
// installed) rather than statically imported here. A top-level
// `import … from "@react-email/components"` would make magic-link.js a hard
// build dependency: a consumer's bundler statically follows the
// `import("./magic-link.js")` in magic-link-lazy and would fail to resolve the
// omitted peer at build time. As a type-only import this reference is erased.
type ReactEmailComponents = typeof import("@react-email/components")

interface Props {
  url: string
  appName?: string
}

export function MagicLinkEmail(
  {
    Html,
    Head,
    Preview,
    Body,
    Container,
    Heading,
    Text,
    Section,
    Button,
  }: ReactEmailComponents,
  { url, appName = "your account" }: Props,
) {
  return (
    <Html>
      <Head />
      <Preview>Sign in to {appName}</Preview>
      <Body style={{ backgroundColor: "#f6f6f6", fontFamily: "system-ui, sans-serif" }}>
        <Container style={{ backgroundColor: "#fff", padding: "32px", maxWidth: "480px" }}>
          <Heading style={{ fontSize: "20px", margin: "0 0 16px" }}>Sign in to {appName}</Heading>
          <Text style={{ fontSize: "14px", lineHeight: "20px", margin: "0 0 24px" }}>
            Click the button below to sign in. The link is valid for 10 minutes and can only be used once.
          </Text>
          <Section style={{ textAlign: "center", margin: "0 0 24px" }}>
            <Button
              href={url}
              style={{
                backgroundColor: "#000",
                color: "#fff",
                padding: "10px 20px",
                borderRadius: "6px",
                textDecoration: "none",
                fontSize: "14px",
              }}
            >
              Sign in
            </Button>
          </Section>
          <Text style={{ fontSize: "12px", color: "#666", margin: "0" }}>
            If you didn't request this email, you can safely ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
