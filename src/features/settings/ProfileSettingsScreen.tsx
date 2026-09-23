import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/katzuDb';
import { isProEffective } from '@/lib/utils/subscription';
import { useSpeechOutput } from '@/lib/speech/useSpeechOutput';
import { KatzuMascot } from '@/components/common/KatzuMascot';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  Volume2,
  Sparkles,
  Bell,
  User,
  Shield,
  LogOut,
  Sliders,
  Check,
  Edit2,
  Gift,
  Copy,
  Share2,
  Users,
  ScrollText,
  Download,
  Trash2,
} from 'lucide-react';
import type { SarcasmLevel } from '@/types/models';
import { workerClient } from '@/lib/api/workerClient';
import {
  clearDiagnostics,
  copyDiagnostics,
  downloadDiagnostics,
  formatDiagnosticsText,
  getDiagnostics,
  subscribeDiagnostics,
} from '@/lib/utils/diagnostics';

export interface ProfileSettingsScreenProps {
  onOpenSubscription: () => void;
  onSignOut: () => void;
  onGoToSignIn?: () => void;
  onOpenTrustPage?: (page: 'privacy' | 'terms' | 'contact') => void;
}

export const ProfileSettingsScreen: React.FC<ProfileSettingsScreenProps> = ({
  onOpenSubscription,
  onSignOut,
  onGoToSignIn,
  onOpenTrustPage,
}) => {
  const user = useLiveQuery(() => db.users.get('current_user'));
  const [showEditName, setShowEditName] = useState(false);
  const [newName, setNewName] = useState(user?.displayName || '');
  const [referralInfo, setReferralInfo] = useState<Awaited<ReturnType<typeof workerClient.getReferralInfo>>>(null);
  const [referralLoading, setReferralLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticsText, setDiagnosticsText] = useState('');
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false);
  const [logCount, setLogCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    workerClient.getReferralInfo().then((info) => {
      if (isMounted) {
        setReferralInfo(info);
        setReferralLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, []);

  // Keep the diagnostics count live without re-rendering on every log line.
  useEffect(() => {
    setLogCount(getDiagnostics().length);
    return subscribeDiagnostics(() => setLogCount(getDiagnostics().length));
  }, []);

  const handleCopyDiagnostics = async () => {
    const ok = await copyDiagnostics();
    if (ok) {
      setDiagnosticsCopied(true);
      setTimeout(() => setDiagnosticsCopied(false), 2000);
    }
  };

  const handleDownloadDiagnostics = () => {
    downloadDiagnostics();
  };

  const handleToggleDiagnostics = () => {
    const next = !showDiagnostics;
    setShowDiagnostics(next);
    if (next) setDiagnosticsText(formatDiagnosticsText());
  };

  const handleCopyReferral = async () => {
    if (!referralInfo?.referral_code) return;
    const shareText = `تعلّم الألمانية مع كَاتْزُو 🐱\nاستخدم كود الإحالة ${referralInfo.referral_code} عند الاشتراك، وستدعم رحلتنا معاً!`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Katzu — تعلّم الألمانية', text: shareText });
      } else {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {}
    }
  };

  const { speak } = useSpeechOutput({ speed: user?.speechSpeed || 1.0 });

  const handleUpdateSpeed = async (speed: number) => {
    await db.users.update('current_user', { speechSpeed: speed });
    speak(
      speed === 1.0
        ? 'Das ist die normale Sprechgeschwindigkeit.'
        : 'Das ist die langsame Sprechgeschwindigkeit.'
    );
  };

  const handleUpdateSarcasm = async (level: SarcasmLevel) => {
    await db.users.update('current_user', { sarcasmLevel: level });
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await db.users.update('current_user', { displayName: newName.trim() });
    setShowEditName(false);
  };

  return (
    <div className="min-h-screen bg-black text-text-primary p-4 max-w-md mx-auto relative pb-28">
      {/* Profile Card Banner */}
      <Card variant="hero" className="p-5 mb-6 relative overflow-hidden border border-primary/30 flex items-center justify-between shadow-glow-purple">
        <div className="max-w-[70%]">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-bold font-arabic leading-tight">
              {user?.displayName || 'مستكشف كَاتْزُو'}
            </h2>
            <button
              onClick={() => {
                setNewName(user?.displayName || '');
                setShowEditName(true);
              }}
              className="p-1 text-text-muted hover:text-primary transition-colors"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          </div>
          <div className="text-xs text-text-secondary mb-3 flex items-center gap-1.5 flex-wrap">
            <span>{user?.email || user?.googleAccountEmail || 'حساب Google متصل'}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-status-success/20 text-status-success font-bold">
              متصل بحساب Google ✓
            </span>
          </div>

          <Badge variant={isProEffective(user) ? 'success' : 'primary'} size="sm">
            {isProEffective(user) ? 'عضوية Pro نشطة' : 'الخطة المجانية'}
          </Badge>
        </div>
        <KatzuMascot name="profile_card" className="w-20 h-20 object-contain" />
      </Card>

      {/* Subscription Upgrade Card */}
      {!isProEffective(user) && (
        <Card
          onClick={onOpenSubscription}
          className="p-4 mb-6 bg-gradient-to-r from-primary/20 via-surface-card to-surface-card border border-primary/40 cursor-pointer flex items-center justify-between shadow-glow-purple"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold font-arabic text-primary">الترقية إلى Katzu Pro</div>
              <div className="text-xs text-text-secondary">محادثات لا محدودة وكافة السيناريوهات</div>
            </div>
          </div>
          <span className="text-xs font-bold font-arabic text-primary">ترقية ←</span>
        </Card>
      )}

      {/* Referral Program Card */}
      <Card className="p-4 mb-6 space-y-3 border border-status-learning/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-status-learning" />
            <div className="text-sm font-bold font-arabic">ادعُ صديقاً، اربح شهر Pro</div>
          </div>
          <Badge variant="learning" size="sm">+1 شهر لكل اشتراك موثّق</Badge>
        </div>
        <p className="text-[11px] text-text-muted leading-relaxed">
          شارك كودك مع الأصدقاء. عندما يشترك صديق لأول مرة في Katzu Pro، تحصل أنت على شهر Pro مجاني يُضاف تلقائياً إلى حسابك.
        </p>

        {referralLoading ? (
          <div className="h-10 rounded-xl bg-surface-subtle animate-pulse" />
        ) : referralInfo?.referral_code ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-10 flex items-center justify-center rounded-xl bg-black border border-border-subtle font-mono text-sm tracking-widest text-status-learning select-all" dir="ltr">
              {referralInfo.referral_code}
            </div>
            <button
              onClick={handleCopyReferral}
              className="h-10 px-3 flex items-center gap-1.5 rounded-xl bg-primary/20 border border-primary text-primary text-xs font-bold font-arabic hover:bg-primary/30 transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
              {copied ? 'تم النسخ' : 'مشاركة'}
            </button>
          </div>
        ) : (
          <div className="text-[11px] text-text-muted">تعذر تحميل كود الإحالة. تحقق من الاتصال وأعد المحاولة.</div>
        )}

        {!referralLoading && referralInfo && (
          <div className="flex items-center gap-4 text-xs font-arabic text-text-secondary">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-primary" />
              إحالات موثّقة: <b className="text-status-success">{referralInfo.verified_referrals}</b>
            </span>
            {referralInfo.pending_referrals > 0 && (
              <span>قيد الانتظار: <b className="text-status-learning">{referralInfo.pending_referrals}</b></span>
            )}
            {referralInfo.total_reward_months > 0 && (
              <span className="text-status-success font-bold">مكاسبك: {referralInfo.total_reward_months} شهر Pro</span>
            )}
          </div>
        )}
      </Card>

      {/* Diagnostics Log (bug reporting aid) */}
      <Card className="p-4 mb-4 space-y-3">
        <button
          type="button"
          onClick={handleToggleDiagnostics}
          className="w-full flex items-center justify-between"
        >
          <label className="text-xs font-bold text-text-secondary flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-primary" />
            سجل الأخطاء التشخيصي
          </label>
          <span className="text-[11px] font-arabic text-text-muted">
            {showDiagnostics ? 'إخفاء' : `${logCount} سجل`} ‹
          </span>
        </button>
        <p className="text-[11px] text-text-muted">
          سجل زمني لكل الأخطاء (مع الطوابع الزمنية) لمساعدتنا في إصلاح أي مشكلة تحدث لك. انسخه أو نزّله وأرسله لنا للدعم.
        </p>

        {showDiagnostics && (
          <div className="space-y-2">
            <textarea
              readOnly
              dir="ltr"
              value={diagnosticsText}
              className="w-full h-40 bg-black border border-border-subtle rounded-xl p-2 text-[10px] font-mono text-text-secondary outline-none resize-none"
            />
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handleCopyDiagnostics}
                className="py-2 rounded-xl text-[11px] font-bold border bg-surface-subtle border-border-subtle text-text-secondary hover:text-text-primary transition-all flex items-center justify-center gap-1"
              >
                {diagnosticsCopied ? <Check className="w-3.5 h-3.5 text-status-success" /> : <Copy className="w-3.5 h-3.5" />}
                {diagnosticsCopied ? 'تم النسخ' : 'نسخ'}
              </button>
              <button
                onClick={handleDownloadDiagnostics}
                className="py-2 rounded-xl text-[11px] font-bold border bg-surface-subtle border-border-subtle text-text-secondary hover:text-text-primary transition-all flex items-center justify-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                تنزيل
              </button>
              <button
                onClick={() => {
                  clearDiagnostics();
                  setDiagnosticsText(formatDiagnosticsText());
                }}
                className="py-2 rounded-xl text-[11px] font-bold border bg-surface-subtle border-status-error/40 text-status-error hover:bg-status-error/10 transition-all flex items-center justify-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                مسح
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Speech Speed Setting */}
      <Card className="p-4 mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-text-secondary flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-primary" />
            سرعة نطق الصوت الألماني (TTS)
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleUpdateSpeed(1.0)}
            className={`py-2.5 rounded-xl text-xs font-semibold border transition-all ${
              (user?.speechSpeed || 1.0) === 1.0
                ? 'bg-primary/20 border-primary text-primary shadow-glow-purple'
                : 'bg-surface-subtle border-border-subtle text-text-secondary'
            }`}
          >
            1.0x طبيعية
          </button>
          <button
            onClick={() => handleUpdateSpeed(0.8)}
            className={`py-2.5 rounded-xl text-xs font-semibold border transition-all ${
              user?.speechSpeed === 0.8
                ? 'bg-primary/20 border-primary text-primary shadow-glow-purple'
                : 'bg-surface-subtle border-border-subtle text-text-secondary'
            }`}
          >
            0.8x هادئة وواضحة
          </button>
        </div>
      </Card>

      {/* Sarcasm Level Setting */}
      <Card className="p-4 mb-6 space-y-3">
        <label className="text-xs font-bold text-text-secondary flex items-center gap-2">
          <Sliders className="w-4 h-4 text-primary" />
          شخصية كَاتْزُو ونبرة السخرية الذكية
        </label>
        <p className="text-[11px] text-text-muted">
          تحدد أسلوب تعليقات كاتزو عند تصحيحك في المحادثات المباشرة.
        </p>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'لطيف', value: 'GENTLE' },
            { label: 'ساخر وذكي', value: 'SASSY' },
            { label: 'قاسٍ بدون رحمة', value: 'DEADPAN' },
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => handleUpdateSarcasm(item.value as SarcasmLevel)}
              className={`py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                (user?.sarcasmLevel || 'SASSY') === item.value
                  ? 'bg-primary/20 border-primary text-primary shadow-glow-purple'
                  : 'bg-surface-subtle border-border-subtle text-text-secondary'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </Card>

      {/* App Info & Sign Out */}
      <div className="space-y-3">
        <div className="flex items-center justify-center gap-4 text-xs text-text-secondary font-arabic">
          <button onClick={() => onOpenTrustPage?.('privacy')} className="hover:text-primary underline">الخصوصية</button>
          <button onClick={() => onOpenTrustPage?.('terms')} className="hover:text-primary underline">الشروط</button>
          <button onClick={() => onOpenTrustPage?.('contact')} className="hover:text-primary underline">الدعم</button>
        </div>
        <div className="p-4 rounded-2xl bg-surface-card border border-border-subtle text-center text-xs text-text-muted space-y-1">
          <div>Katzu Web App v1.0.0 (PWA)</div>
          <div className="text-text-secondary">صُنع بواسطة غيدق علوش — ghaidak.com</div>
        </div>

        <Button
          variant="danger"
          size="md"
          className="w-full flex items-center justify-center gap-2"
          onClick={onSignOut}
        >
          <LogOut className="w-4 h-4" />
          تسجيل الخروج من الحساب
        </Button>
      </div>

      {/* Edit Name Modal */}
      <Modal isOpen={showEditName} onClose={() => setShowEditName(false)} title="تعديل الاسم">
        <form onSubmit={handleSaveName} className="space-y-4 py-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full h-12 bg-surface-card border border-border-subtle focus:border-primary rounded-xl px-4 text-sm font-arabic outline-none"
            placeholder="اسمك الجديد"
            required
          />
          <Button type="submit" size="md" className="w-full">
            حفظ التغييرات
          </Button>
        </form>
      </Modal>
    </div>
  );
};
