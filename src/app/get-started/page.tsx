import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { SectionKicker } from "@/components/SectionKicker";
import { IntakeForm } from "@/components/IntakeForm";
import { isValidTier } from "@/lib/intake";

export const metadata: Metadata = {
  title: "Get Started",
  description:
    "Submit your property and loan details to start your VA loan Risk Memorandum review.",
};

export default async function GetStartedPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string }>;
}) {
  const params = await searchParams;
  const initialTier = isValidTier(params.tier) ? params.tier : undefined;

  return (
    <section className="bg-navy-50 py-20">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <SectionKicker>Get Started</SectionKicker>
          <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-navy-900 sm:text-5xl">
            Let&apos;s underwrite your deal.
          </h1>
          <p className="mt-5 text-navy-900/60">
            Five short steps. We&apos;ll follow up by email to confirm your
            order and begin the review.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-2xl">
          <IntakeForm initialTier={initialTier} />
        </div>
      </Container>
    </section>
  );
}
