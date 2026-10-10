import Link from "next/link";
import PageHeader from "@/app/components/PageHeader";

export const dynamic = "force-dynamic";

// The 5 steps, mapped to the REAL routes + what actually happens in the app.
// (Send is manual — the app opens a pre-filled Gmail/WhatsApp compose; it never
// auto-sends or fabricates contacts.)
const STEPS = [
  {
    n: 1,
    title: "Find people to talk to",
    tag: "Sourcing",
    body: "Tell the system who you're looking for — a simple phrase like “Plumbers in Chicago” or “SaaS companies hiring remote”. It searches Google Places and other public databases and builds a list of real businesses for you.",
    href: "/sources",
    cta: "Open Sources",
  },
  {
    n: 2,
    title: "Let the AI do the heavy lifting",
    tag: "Qualifying",
    body: "Instead of reading every website yourself, select leads and click Qualify. The AI scores each one (good fit or skip), and pulls the decision-maker's verified, public contact details — it never guesses or fabricates an email.",
    href: "/leads",
    cta: "Go to Leads",
  },
  {
    n: 3,
    title: "Write the perfect message",
    tag: "Drafting",
    body: "No blank page. The AI drafts a personalized email, WhatsApp message, and call script for each lead, based on their info. Build a Sequence (a multi-step cadence) and each follow-up gets its own draft too.",
    href: "/campaigns",
    cta: "Build a campaign",
  },
  {
    n: 4,
    title: "Send and remember to follow up",
    tag: "Chasing",
    body: "Click to open a pre-filled Gmail or WhatsApp message — you review it and hit send (nothing goes out automatically). If they don't reply, the Today dashboard reminds you to follow up, so no lead slips through.",
    href: "/",
    cta: "Open Today",
  },
  {
    n: 5,
    title: "Track your money",
    tag: "Closing & measuring",
    body: "When someone says yes, log the deal and its value. Reports shows which searches, sources, and niches actually make you money — and your cost per won deal.",
    href: "/reports",
    cta: "See Reports",
  },
];

function StepCard({ step }) {
  return (
    <div className="card-accent p-5">
      <div className="flex items-start gap-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent2 font-display text-base font-bold text-white shadow-[0_4px_12px_-3px_rgb(var(--accent)/0.5)]">
          {step.n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="eyebrow">{step.tag}</div>
          <h3 className="h-display mt-0.5 text-lg text-ink">{step.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
          <Link href={step.href} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
            {step.cta} →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function GuidePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Getting started"
        title="How Outreach Pilot works"
        subtitle="Your AI sales assistant finds businesses, checks if they're a good fit, drafts the outreach, and reminds you to follow up — you just point it in the right direction and hit send."
      />

      {/* One-line flow map */}
      <div className="card flex flex-wrap items-center justify-center gap-x-2 gap-y-1 p-4 text-sm font-medium text-muted">
        <span className="text-ink">Find</span><span className="text-accent">→</span>
        <span className="text-ink">Qualify</span><span className="text-accent">→</span>
        <span className="text-ink">Draft</span><span className="text-accent">→</span>
        <span className="text-ink">Send &amp; chase</span><span className="text-accent">→</span>
        <span className="text-ink">Close &amp; measure</span>
      </div>

      <div className="space-y-4">
        {STEPS.map((s) => <StepCard key={s.n} step={s} />)}
      </div>

      {/* Quick start */}
      <div className="card p-6">
        <h3 className="h-display text-lg text-ink">Get your first lead right now</h3>
        <ol className="mt-3 space-y-2 text-sm text-ink">
          <li><span className="font-semibold text-accent">1.</span> Go to <Link href="/sources" className="font-medium text-accent hover:underline">Sources</Link> (or <Link href="/leads" className="font-medium text-accent hover:underline">Leads → Find</Link>) and type a business type + city, e.g. “Roofers in Dallas”.</li>
          <li><span className="font-semibold text-accent">2.</span> Let the list load, then select leads and click <span className="font-medium">Qualify &amp; Score</span>.</li>
          <li><span className="font-semibold text-accent">3.</span> Add them to a <Link href="/campaigns" className="font-medium text-accent hover:underline">Campaign</Link> and <span className="font-medium">Generate Messages</span>.</li>
          <li><span className="font-semibold text-accent">4.</span> Review each draft, click to open it in Gmail/WhatsApp, and send.</li>
          <li><span className="font-semibold text-accent">5.</span> Track replies and deals on <Link href="/" className="font-medium text-accent hover:underline">Today</Link> and <Link href="/reports" className="font-medium text-accent hover:underline">Reports</Link>.</li>
        </ol>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/generate" className="btn-primary px-5 py-2.5">✨ Generate my first leads</Link>
          <Link href="/settings" className="btn-ghost px-5 py-2.5">Add an API key</Link>
        </div>
        <p className="mt-3 text-xs text-muted">Live AI (real leads, contacts &amp; messages) needs an API key in Settings → API Management. Without one, the app runs in simulated mode with placeholder data.</p>
      </div>
    </div>
  );
}
