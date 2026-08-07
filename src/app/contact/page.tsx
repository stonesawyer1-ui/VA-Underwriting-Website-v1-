import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { SectionKicker } from "@/components/SectionKicker";
import { ContactForm } from "@/components/ContactForm";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Garrison Risk Review.",
};

export default function ContactPage() {
  return (
    <section className="bg-navy-50 py-20">
      <Container>
        <div className="mx-auto max-w-xl text-center">
          <SectionKicker>Contact</SectionKicker>
          <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-navy-900 sm:text-5xl">
            Questions before you order?
          </h1>
          <p className="mt-5 text-navy-900/60">
            Send a message below, or reach out directly at{" "}
            <a
              href={`mailto:${siteConfig.email}`}
              className="font-semibold text-navy-900 underline decoration-red-600 underline-offset-4"
            >
              {siteConfig.email}
            </a>
            .
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-xl">
          <ContactForm />
        </div>
      </Container>
    </section>
  );
}
