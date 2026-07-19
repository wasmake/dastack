export type LegalSection = { title: string; paragraphs: readonly string[] };

export function LegalPage({
  title,
  description,
  sections,
}: {
  title: string;
  description: string;
  sections: readonly LegalSection[];
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-primary">
        Legal
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
        {title}
      </h1>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      <div className="mt-12 space-y-10 border-t pt-10">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-lg font-semibold">{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p
                key={paragraph}
                className="mt-3 text-sm leading-7 text-muted-foreground"
              >
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
