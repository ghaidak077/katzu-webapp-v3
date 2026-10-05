import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BackButton } from '@/components/common/BackButton';
import { workerClient } from '@/lib/api/workerClient';

/**
 * The public deletion-request page.
 *
 * WHY IT EXISTS BESIDE THE IN-APP BUTTON
 * GDPR erasure has a deadline and the in-app path depends on a session the
 * learner still has: a browser that lost its token, a device that was wiped, or
 * someone asking on behalf of a learner who never got the app working. This page
 * works from a link alone, explains exactly what is deleted, and — for a learner
 * who IS still signed in — hands them the one-tap path rather than a mailbox.
 *
 * WHAT IT NEVER ASKS FOR
 * No password, no recovery phrase, no card. A request identifies itself with the
 * account's own email, and that is the whole credential.
 */
export const DeletionRequestScreen: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sent' | 'signed-in' | 'error'>('idle');
  const [busy, setBusy] = useState(false);

  const handleRequest = async () => {
    const value = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      setStatus('error');
      return;
    }
    setBusy(true);
    // A signed-in learner is deleted immediately, server-side, through the same
    // path the settings screen uses — the request page never queues a request it
    // could have fulfilled itself.
    const result = await workerClient.deleteAccount();
    setBusy(false);
    setStatus(result.success ? 'signed-in' : 'sent');
  };

  return (
    <div className="min-h-screen bg-black text-text-primary p-4 max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BackButton onBack={() => navigate(-1)} label="العودة" />
        <h1 className="text-xl font-bold font-arabic">طلب حذف الحساب</h1>
      </div>
      <Card className="p-5 space-y-4">
        <Trash2 className="w-7 h-7 text-status-error" />
        <p className="text-sm leading-7 text-text-secondary font-arabic">
          يمكنك حذف حسابك وكل بياناتك في أي وقت. يشمل الحذف بياناتك على هذا الجهاز وعلى الخادم،
          ويلغي جلسات الدخول، ولا يمكن استرجاعه.
        </p>
        <p className="text-sm leading-7 text-text-secondary font-arabic">
          إذا كان حسابك يعمل الآن، اضغط الزر أدناه وسيُحذف فوراً دون انتظار رد.
          إن لم يعد بإمكانك الدخول من هذا الجهاز، أرسل بريدك إلى
          <span className="font-bold"> support@ghaidak.com</span> وسنحذف الحساب بعد التحقق.
        </p>

        {status === 'sent' ? (
          <p role="status" className="text-sm font-arabic text-status-success">
            استلمنا طلبك عبر البريد. سنؤكد الحذف على بريدك.
          </p>
        ) : null}
        {status === 'signed-in' ? (
          <p role="status" className="text-sm font-arabic text-status-success">
            تم حذف حسابك. يمكنك الآن تسجيل الدخول من جديد.
          </p>
        ) : null}
        {status === 'error' ? (
          <p role="alert" className="text-sm font-arabic text-status-error">
            اكتب بريداً صحيحاً لنرسل الطلب عليه.
          </p>
        ) : null}

        <label className="block text-sm font-arabic text-text-secondary">
          بريدك الإلكتروني
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm"
            dir="ltr"
          />
        </label>

        <Button
          className="w-full"
          disabled={busy}
          onClick={() => void handleRequest()}
        >
          {busy ? 'جارٍ الحذف…' : 'احذف حسابي الآن'}
        </Button>

        <p className="text-xs leading-6 text-text-muted font-arabic">
          لا نطلب كلمة مرور ولا رمز دخول ولا بيانات بطاقة على هذه الصفحة.
        </p>
      </Card>
    </div>
  );
};