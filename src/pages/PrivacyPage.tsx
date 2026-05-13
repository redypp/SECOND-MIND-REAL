/**
 * Privacy Policy — placeholder content.
 *
 * ⚠️  Before App Store submission: have an attorney review this. The text
 * below is a reasonable starting point that mirrors the actual data flow
 * but is NOT legal advice. Replace placeholders ([COMPANY], [DATE], etc.)
 * before going live.
 */

import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 bg-background overflow-y-auto safe-area-top-ios">
      <div className="max-w-2xl mx-auto px-6 py-8 pb-[calc(var(--app-safe-bottom,0px)+24px)]">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-foreground/70 hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <h1 className="text-2xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-xs text-foreground/55 mb-6">Last updated: [DATE]</p>

        <div className="prose prose-sm dark:prose-invert text-sm text-foreground/85 space-y-4 leading-relaxed">
          <p>
            Second Mind ("we", "us") respects your privacy. This policy explains what we collect,
            why, and the choices you have.
          </p>

          <h2 className="text-base font-semibold pt-2">Information we collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Account data</strong>: email, name, optional profile fields you choose to provide.</li>
            <li><strong>Content you create</strong>: archive items, journals, habits, tasks, and other personal data you save in the app.</li>
            <li><strong>Usage analytics</strong>: anonymized event data (e.g. screens visited, features used) to understand how Second Mind is used.</li>
            <li><strong>Diagnostic data</strong>: crash reports and error traces to fix bugs.</li>
            <li><strong>Subscription status</strong>: whether you have an active Second Mind Plus subscription (purchased via Apple).</li>
          </ul>

          <h2 className="text-base font-semibold pt-2">How we use it</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>To provide the core service (storing and syncing your data).</li>
            <li>To improve the product based on aggregate usage patterns.</li>
            <li>To support, troubleshoot, and contact you about your account.</li>
          </ul>

          <h2 className="text-base font-semibold pt-2">Service providers we share with</h2>
          <p>We share the minimum data required with the following infrastructure providers:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Supabase</strong> — authentication and database hosting.</li>
            <li><strong>Vercel</strong> — web hosting and content delivery.</li>
            <li><strong>PostHog</strong> — product analytics (anonymized).</li>
            <li><strong>Sentry</strong> — error and performance monitoring.</li>
            <li><strong>RevenueCat</strong> — subscription state validation (via Apple).</li>
            <li><strong>Apple</strong> — payments and StoreKit purchase records.</li>
          </ul>

          <h2 className="text-base font-semibold pt-2">Your rights</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Access</strong>: you can view all your content within the app at any time.</li>
            <li><strong>Export</strong>: contact us to receive a copy of your data.</li>
            <li><strong>Deletion</strong>: you can permanently delete your account and all associated data from Settings → Delete Account.</li>
          </ul>

          <h2 className="text-base font-semibold pt-2">Data retention</h2>
          <p>We retain your data while your account is active. When you delete your account, your data is permanently removed within 30 days, with the exception of legal or financial records we are required to retain.</p>

          <h2 className="text-base font-semibold pt-2">Children</h2>
          <p>Second Mind is not directed at children under 13. We do not knowingly collect data from children under 13.</p>

          <h2 className="text-base font-semibold pt-2">Changes to this policy</h2>
          <p>We may update this policy. Material changes will be communicated in-app.</p>

          <h2 className="text-base font-semibold pt-2">Contact</h2>
          <p>Questions: <a href="mailto:[SUPPORT_EMAIL]" className="underline">[SUPPORT_EMAIL]</a></p>
        </div>
      </div>
    </div>
  );
}
