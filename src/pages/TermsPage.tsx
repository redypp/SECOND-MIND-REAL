/**
 * Terms of Service — placeholder content.
 *
 * ⚠️  Before App Store submission: have an attorney review this. Replace
 * placeholders ([COMPANY], [DATE], [JURISDICTION], etc.) before going live.
 */

import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
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

        <h1 className="text-2xl font-bold mb-2">Terms of Service</h1>
        <p className="text-xs text-foreground/55 mb-6">Last updated: [DATE]</p>

        <div className="text-sm text-foreground/85 space-y-4 leading-relaxed">
          <p>
            By using Second Mind ("the Service"), you agree to these terms. If you do not agree, do not use the Service.
          </p>

          <h2 className="text-base font-semibold pt-2">Eligibility</h2>
          <p>You must be at least 13 years old (or the digital age of consent in your country) to use Second Mind.</p>

          <h2 className="text-base font-semibold pt-2">Your account</h2>
          <p>You are responsible for safeguarding your login credentials and for all activity under your account.</p>

          <h2 className="text-base font-semibold pt-2">Subscriptions</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Second Mind Plus is offered as a recurring subscription with a 7-day free trial.</li>
            <li>Payment is charged to your Apple ID at confirmation of purchase, after the trial ends.</li>
            <li>The subscription renews automatically unless cancelled at least 24 hours before the end of the current period.</li>
            <li>You can manage and cancel subscriptions in iOS Settings → Apple ID → Subscriptions.</li>
            <li>No refunds for partial subscription periods. Refund requests go through Apple.</li>
          </ul>

          <h2 className="text-base font-semibold pt-2">Your content</h2>
          <p>You retain ownership of all content you create in Second Mind. You grant us a limited license to host and process your content solely to provide the Service.</p>

          <h2 className="text-base font-semibold pt-2">Acceptable use</h2>
          <p>Do not use Second Mind to violate the law, infringe others' rights, attempt to access other users' data, or reverse-engineer the Service.</p>

          <h2 className="text-base font-semibold pt-2">Termination</h2>
          <p>You may delete your account at any time from Settings. We may suspend or terminate accounts that violate these terms.</p>

          <h2 className="text-base font-semibold pt-2">Disclaimer & limitation of liability</h2>
          <p>The Service is provided "as is" without warranties of any kind. To the maximum extent permitted by law, [COMPANY] is not liable for indirect, incidental, or consequential damages.</p>

          <h2 className="text-base font-semibold pt-2">Changes</h2>
          <p>We may update these terms. Continued use after material changes constitutes acceptance.</p>

          <h2 className="text-base font-semibold pt-2">Governing law</h2>
          <p>These terms are governed by the laws of [JURISDICTION].</p>

          <h2 className="text-base font-semibold pt-2">Contact</h2>
          <p>Questions: <a href="mailto:[SUPPORT_EMAIL]" className="underline">[SUPPORT_EMAIL]</a></p>
        </div>
      </div>
    </div>
  );
}
