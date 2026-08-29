import type { Metadata } from "next";
import Image from "next/image";
import { Container } from "@/components/Container";
import { CTAButton } from "@/components/CTAButton";
import { SectionKicker } from "@/components/SectionKicker";
import { Reveal } from "@/components/Reveal";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why Garrison Risk Review exists — built by an active-duty officer who underwrote his own VA loan house-hack first.",
};

export default function AboutPage() {
  return (
    <>
      <section className="bg-navy-900 py-20 text-white">
        <Container>
          <SectionKicker light>About</SectionKicker>
          <h1 className="mt-4 max-w-2xl text-balance font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Built because I needed this and it didn&apos;t exist.
          </h1>
        </Container>
      </section>

      <section className="bg-white py-20">
        <Container>
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
            <Reveal className="lg:col-span-2">
              <div className="prose-none space-y-5 text-sm leading-relaxed text-navy-900/70 sm:text-base">
                <p>
                  I&apos;m an active-duty Engineer Officer and a graduate of the
                  United States Military Academy at West Point. Like most
                  service members, my introduction to real estate was the VA
                  loan benefit — and across two PCS moves to opposite ends of
                  the country, I learned firsthand how much the numbers can
                  shift once a property stops being your primary residence.
                </p>
                <p>
                  Each time orders came through, the tax bill on my own
                  property was reassessed for non-owner-occupied status, and
                  the rent I needed to cover the new payment wasn&apos;t what
                  the online calculators had told me going in. I ran the real
                  numbers by hand — county reassessment schedules, comparable
                  rents, realistic vacancy — because nobody in the loan
                  process was going to do it for me. The lender&apos;s job is
                  to qualify the loan, not to tell you whether the deal still
                  works once you leave.
                </p>
                <p>
                  Garrison Risk Review is that same process, formalized, so
                  the next service member buying with a VA loan doesn&apos;t
                  have to learn it the hard way. It&apos;s independent,
                  flat-fee, and built specifically around the mechanics of VA
                  loans, PCS timelines, and 2-4 unit house-hacking — not a
                  generic rental calculator.
                </p>
                <p>
                  This is a small, veteran-owned operation. I&apos;d rather be
                  upfront about that than dress it up as something bigger than
                  it is.
                </p>
              </div>

              <div className="mt-10">
                <CTAButton href="/get-started">Get Your Underwriting Report</CTAButton>
              </div>
            </Reveal>

            <Reveal delay={0.1} className="space-y-4">
              <div className="relative aspect-square w-full overflow-hidden rounded-sm border border-navy-900/10">
                <Image
                  src="/images/founder.jpg"
                  alt="Stone McGilvra Sawyer, Garrison Risk Review founder, active-duty Engineer Officer and West Point graduate"
                  fill
                  sizes="(min-width: 1024px) 33vw, 100vw"
                  className="object-cover object-top"
                  priority
                />
              </div>
              <div>
                <p className="font-display text-base font-bold text-navy-900">
                  Stone McGilvra Sawyer
                </p>
                <p className="text-sm text-navy-900/50">Founder, Garrison Risk Review</p>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      <section className="border-t border-navy-900/10 bg-navy-50 py-16">
        <Container className="text-center">
          <p className="text-sm text-navy-900/60">
            Questions before you order? Reach out directly.
          </p>
          <a
            href={`mailto:${siteConfig.email}`}
            className="mt-2 inline-block font-semibold text-navy-900 underline decoration-red-600 underline-offset-4"
          >
            {siteConfig.email}
          </a>
        </Container>
      </section>
    </>
  );
}
