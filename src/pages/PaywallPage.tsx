/**
 * PaywallPage — the hard paywall users hit after onboarding.
 *
 * Required UX (App Store guidelines):
 *   - Restore Purchases button (exact label)
 *   - Plain disclosure of trial → recurring price
 *   - Links to Terms + Privacy
 *
 * Two plans, monthly + yearly. Yearly is the default selection because
 * the lifetime value math works out better and it's the "save" option.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import { useEntitlement } from '@/contexts/EntitlementContext';
import { PRODUCTS, type ProductId } from '@/lib/iap';
import { analytics, Events } from '@/lib/analytics';

const PLANS: Array<{
  id: ProductId;
  label: string;
  price: string;
  perMonth: string;
  badge?: string;
}> = [
  {
    id: PRODUCTS.PLUS_YEARLY,
    label: 'Yearly',
    price: '$29.99 / year',
    perMonth: '$2.50 / month',
    badge: 'Save 50%',
  },
  {
    id: PRODUCTS.PLUS_MONTHLY,
    label: 'Monthly',
    price: '$4.99 / month',
    perMonth: '',
  },
];

const FEATURES = [
  'Unlimited archive items, collections & habits',
  'AI Ask, summaries, and life subheadings',
  'Daily Plan, Journal, and Habits — unlimited',
  'Priority sync across all your devices',
  'Future Plus features at no extra cost',
];

export default function PaywallPage() {
  const navigate = useNavigate();
  const { purchase, restore } = useEntitlement();
  const [selected, setSelected] = useState<ProductId>(PRODUCTS.PLUS_YEARLY);
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fire view event once per mount.
  useState(() => { analytics.capture(Events.PaywallView); });

  const startTrial = async () => {
    setBusy('purchase');
    setErrorMsg(null);
    const result = await purchase(selected);
    setBusy(null);
    if (result.status === 'success') {
      navigate('/', { replace: true });
    } else if (result.status === 'error') {
      setErrorMsg(result.message);
    }
  };

  const handleRestore = async () => {
    setBusy('restore');
    setErrorMsg(null);
    const result = await restore();
    setBusy(null);
    if (result.status === 'success') {
      navigate('/', { replace: true });
    } else if (result.status === 'error') {
      setErrorMsg(result.message || 'No previous purchases found.');
    }
  };

  return (
    <div className="fixed inset-0 bg-background overflow-y-auto safe-area-top-ios">
      <div className="min-h-full flex flex-col px-6 py-10 pb-[calc(var(--app-safe-bottom,0px)+24px)]">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <p className="text-[10px] uppercase tracking-[0.22em] font-medium text-foreground/55 mb-3">
            Second Mind Plus
          </p>
          <h1
            className="font-display tracking-[-0.04em] leading-[0.92] text-foreground"
            style={{ fontSize: 'clamp(2.4rem, 10vw, 3.6rem)', fontWeight: 800 }}
          >
            7 days free.
            <br />
            Then unlimited.
          </h1>
          <p className="mt-4 text-sm text-foreground/65 leading-relaxed max-w-[28ch]">
            Capture your life — your tasks, your journal, your archive — without limits.
          </p>
        </motion.div>

        {/* Feature list */}
        <motion.ul
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="space-y-2.5 mb-8"
        >
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-3 text-sm text-foreground/85">
              <span className="mt-[3px] flex-none w-4 h-4 rounded-full bg-foreground/10 flex items-center justify-center">
                <Check className="w-2.5 h-2.5" strokeWidth={2.5} />
              </span>
              <span>{f}</span>
            </li>
          ))}
        </motion.ul>

        {/* Plan picker */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="space-y-2 mb-6"
        >
          {PLANS.map((plan) => {
            const isSelected = selected === plan.id;
            return (
              <button
                key={plan.id}
                onClick={() => setSelected(plan.id)}
                className="w-full text-left px-4 py-3.5 rounded-2xl transition-all relative"
                style={{
                  background: isSelected ? 'hsl(var(--foreground) / 0.06)' : 'hsl(var(--foreground) / 0.025)',
                  border: `1.5px solid ${isSelected ? 'hsl(var(--foreground) / 0.85)' : 'hsl(var(--foreground) / 0.12)'}`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{plan.label}</p>
                      {plan.badge && (
                        <span className="text-[9px] uppercase tracking-[0.14em] font-semibold px-1.5 py-0.5 rounded-full bg-foreground text-background">
                          {plan.badge}
                        </span>
                      )}
                    </div>
                    {plan.perMonth && (
                      <p className="text-xs text-foreground/55 mt-0.5">{plan.perMonth}</p>
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground/85">{plan.price}</p>
                </div>
              </button>
            );
          })}
        </motion.div>

        {/* CTA */}
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          onClick={startTrial}
          disabled={busy !== null}
          whileTap={{ scale: 0.985 }}
          className="w-full py-4 rounded-2xl text-sm font-semibold bg-foreground text-background disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {busy === 'purchase' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Start 7-day free trial
        </motion.button>

        {errorMsg && (
          <p className="mt-3 text-xs text-center text-destructive">{errorMsg}</p>
        )}

        {/* Fine print + secondary actions */}
        <div className="mt-5 text-center text-[11px] leading-relaxed text-foreground/50 max-w-[36ch] mx-auto">
          7 days free, then your plan renews automatically until cancelled.
          Cancel anytime in App Store settings.
        </div>

        <div className="mt-4 flex items-center justify-center gap-5 text-[11px] text-foreground/55">
          <button
            onClick={handleRestore}
            disabled={busy !== null}
            className="underline underline-offset-2 disabled:opacity-50"
          >
            {busy === 'restore' ? 'Restoring…' : 'Restore Purchases'}
          </button>
          <a href="/terms" className="underline underline-offset-2">Terms</a>
          <a href="/privacy" className="underline underline-offset-2">Privacy</a>
        </div>
      </div>
    </div>
  );
}
