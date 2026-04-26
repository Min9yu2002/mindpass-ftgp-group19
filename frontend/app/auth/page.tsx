import AuthCard from "../../components/AuthCard";
import GlassCard from "../../components/GlassCard";
import RoleIsolationBlocker from "../../components/RoleIsolationBlocker";
import SectionHeading from "../../components/SectionHeading";
import { redirect } from "next/navigation";

type AuthPageProps = {
  searchParams?: Promise<{ role?: string }>;
};

export default async function AuthPage({ searchParams }: AuthPageProps) {
  const params = searchParams ? await searchParams : undefined;

  if (params?.role === "therapist") {
    redirect("/therapist-login");
  }

  return (
    <main className="app-shell page-canvas page-canvas-soft relative overflow-hidden bg-background pt-32 text-foreground md:pt-36">
      <div className="relative mx-auto w-full max-w-7xl px-6 py-10 lg:px-10">
        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div>
            <SectionHeading
              eyebrow="Access"
              title="Zero-PII entry for protected mental health support"
              titleClassName="font-hero-syne"
              description="MindPass uses a wallet-first identity flow. Claim your subsidy, connect your wallet, and enter support without names, emails, or traditional account forms."
            />

            <div className="mt-8">
              <RoleIsolationBlocker
                forbiddenProfileKey="mindpass-therapist-profile"
                title="Access Denied: You are currently logged in as a Provider."
                description="Please use the Sign Out button in the navigation bar before accessing the Patient portal."
              >
                <AuthCard initialMode="create" />
              </RoleIsolationBlocker>
            </div>
          </div>

          <div className="space-y-4">
            <GlassCard className="glass-panel p-6">
              <div className="mb-6">
                <p className="text-sm uppercase tracking-[0.24em] text-[var(--text-faint)]">
                  Why MindPass
                </p>
                <h2 className="font-hero-syne mt-3 text-2xl text-[var(--text-primary)]">
                  Convenience meets Zero-Knowledge
                </h2>
              </div>
              <div className="space-y-3">
                {[
                  {
                    title: "1. Claim your Subsidy",
                    description:
                      "Enter your government support code to secure session funding.",
                  },
                  {
                    title: "2. Wallet as Identity",
                    description:
                      "Connect your Web3 wallet. No names, no emails. Your cryptographic key is your only identity.",
                  },
                  {
                    title: "3. Sovereign Data Storage",
                    description:
                      "Your chat history is saved on our platform for easy access, but it's fully encrypted. You decide which therapist gets to see it.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="liquid-glass-soft rounded-[24px] border border-[var(--glass-border-soft)] px-4 py-4"
                  >
                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard className="glass-panel glass-highlight p-6">
              <p className="text-sm uppercase tracking-[0.24em] text-[var(--text-faint)]">
                MVP Demo Notes
              </p>
              <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--text-muted)]">
                <p>
                  This flow demonstrates a Web2.5 hybrid approach. It allows patients to enjoy the UX of standard account creation while leveraging blockchain for secure, user-controlled data encryption.
                </p>
              </div>
            </GlassCard>
          </div>
        </section>
      </div>
    </main>
  );
}
