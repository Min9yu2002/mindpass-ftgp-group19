import AuthCard from "../../components/AuthCard";
import GlassCard from "../../components/GlassCard";
import SectionHeading from "../../components/SectionHeading";

type AuthPageProps = {
  searchParams?: Promise<{ role?: string }>;
};

export default async function AuthPage({ searchParams }: AuthPageProps) {
  const params = searchParams ? await searchParams : undefined;
  
  // 模式：諮商師憑證登入、病患建立帳戶、病患登入
  const initialMode = params?.role === "therapist" ? "therapist" : "create";

  return (
    <main className="app-shell page-canvas page-canvas-soft relative overflow-hidden bg-background pt-32 text-foreground md:pt-36">
      <div className="relative mx-auto w-full max-w-7xl px-6 py-10 lg:px-10">
        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          
          {/* 左側：登入 / 註冊控制台 */}
          <div>
            <SectionHeading
              eyebrow="Access"
              title={
                initialMode === "therapist" 
                  ? "Therapist Verification" 
                  : "Create Your Secure Account"
              }
              description={
                initialMode === "therapist"
                  ? "Connect your authorized wallet to verify your credentials and access the portal."
                  : "Choose a username and link a Web3 wallet. Your data is encrypted and stored safely on our platform, but only YOU hold the keys to read it."
              }
            />

            <div className="mt-8">
              {/* 這裡的 AuthCard 將會實作 Username 輸入框與 Connect Wallet 按鈕 */}
              <AuthCard initialMode={initialMode} />
            </div>
          </div>

          {/* 右側：為什麼我們這樣設計的說明 */}
          <div className="space-y-4">
            <GlassCard className="glass-panel p-6">
              <div className="mb-6">
                <p className="text-sm uppercase tracking-[0.24em] text-[var(--text-faint)]">
                  Why MindPass
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">
                  Convenience meets Zero-Knowledge
                </h2>
              </div>
              <div className="space-y-3">
                {[
                  {
                    title: "1. Create a Username",
                    description:
                      "Set up a simple profile. No real names or emails are required to keep your identity protected.",
                  },
                  {
                    title: "2. Link Your Wallet",
                    description:
                      "Your wallet acts as your cryptographic key. It manages your $MIND tokens and encrypts your data.",
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
