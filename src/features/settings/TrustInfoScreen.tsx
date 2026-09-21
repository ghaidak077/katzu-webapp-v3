import React from 'react';
import { ArrowRight, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

type TrustPage = 'privacy' | 'terms' | 'contact';

export interface TrustInfoScreenProps {
  page: TrustPage;
  onBack: () => void;
}

const content: Record<TrustPage, { title: string; paragraphs: string[] }> = {
  privacy: {
    title: 'الخصوصية والبيانات',
    paragraphs: [
      'نستخدم حساب Google لتسجيل الدخول وربط تقدمك بحسابك. نخزن بيانات التعلم مثل الجلسات والأخطاء والمفردات التي حفظتها حتى تتمكن من المتابعة على أجهزتك.',
      'عند استخدام المحادثة الذكية، تُرسل الرسائل الضرورية إلى خادم Katzu لمعالجتها عبر مزود الذكاء الاصطناعي. لا نبيع بياناتك ولا نستخدم نصوصك للإعلانات.',
      'يمكنك طلب تصدير بياناتك أو حذف حسابك من الإعدادات. هذه الصفحة توضيحية أولية ويجب مراجعتها قانونياً قبل الإطلاق العام.',
    ],
  },
  terms: {
    title: 'شروط الاستخدام',
    paragraphs: [
      'Katzu أداة تدريب لغوي وليست بديلاً عن محامٍ أو طبيب أو جهة حكومية أو مستشار هجرة. تحقق دائماً من المعلومات الرسمية قبل اتخاذ قرار في ألمانيا.',
      'تُستخدم الحصة المجانية والميزات المدفوعة وفق الحدود الظاهرة داخل التطبيق. لا نعد باستخدام ذكاء اصطناعي غير محدود عندما تكون هناك حدود استخدام عادلة.',
      'هذه الصفحة مسودة تشغيلية وليست نصاً قانونياً نهائياً، ويجب اعتمادها من صاحب المنتج ومستشار قانوني قبل الدفع العام.',
    ],
  },
  contact: {
    title: 'تواصل معنا',
    paragraphs: [
      'إذا واجهت مشكلة في تسجيل الدخول أو المزامنة أو محتوى غير مناسب، أخبرنا بالتفاصيل دون إرسال كلمات المرور أو رموز الدخول.',
      'للدعم: ghaidak.com. أضف بريد الدعم الرسمي من إعدادات النشر قبل فتح التسجيل العام.',
    ],
  },
};

export const TrustInfoScreen: React.FC<TrustInfoScreenProps> = ({ page, onBack }) => {
  const selected = content[page];
  return (
    <div className="min-h-screen bg-black text-text-primary p-4 max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          aria-label="العودة"
          className="p-2.5 rounded-2xl bg-surface-card border border-border-subtle"
        >
          <ArrowRight className="w-5 h-5 text-text-secondary" />
        </button>
        <h1 className="text-xl font-bold font-arabic">{selected.title}</h1>
      </div>
      <Card className="p-5 space-y-4">
        <ShieldCheck className="w-7 h-7 text-primary" />
        {selected.paragraphs.map((paragraph) => (
          <p key={paragraph} className="text-sm leading-7 text-text-secondary font-arabic">
            {paragraph}
          </p>
        ))}
        {page === 'contact' && (
          <Button
            className="w-full flex items-center justify-center gap-2"
            onClick={() => {
              window.location.href = 'mailto:support@ghaidak.com';
            }}
          >
            <Mail className="w-4 h-4" />
            إرسال بريد الدعم
          </Button>
        )}
      </Card>
    </div>
  );
};
