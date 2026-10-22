import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button, PrimaryAction } from '@/components/ui/Button';
import { db } from '@/lib/db/katzuDb';
import { resolveOpeningScenarioId } from '@/lib/journey/opening';

/**
 * The sheet that explains a closed Practice/Progress tab.
 *
 * It says two things and offers two ways out, and that is deliberate:
 *
 *  - WHAT is closed and WHY (one short conversation opens all of it), so the
 *    locked tab reads as a sequence rather than as a missing feature;
 *  - the ONE action that opens it — the same first episode every learner gets,
 *    resolved the same way (`resolveOpeningScenarioId`), so the button cannot
 *    land on a scene that is not on the device;
 *  - and a way to say "later", because a sheet with one button is a demand.
 *
 * There is no "open anyway". The tabs stay closed until the conversation is
 * finished; a bypass would make the rule a suggestion and would leave the
 * learner in the empty state the lock exists to prevent.
 */
export interface PracticeLockSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PracticeLockSheet: React.FC<PracticeLockSheetProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();

  const startFirstConversation = async () => {
    // Close first: the sheet must not still be mounted over the screen it
    // opens, and the tap means "go".
    onClose();
    let openingId: string | null = null;
    try {
      openingId = resolveOpeningScenarioId(await db.scenarios.toArray());
    } catch {
      // An unreadable cache is a reason to keep today's destination, never to
      // strand the learner between two screens.
      openingId = null;
    }
    if (openingId) {
      navigate(`/scenario/${encodeURIComponent(openingId)}/story`);
      return;
    }
    navigate('/app/trail');
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="هذا القسم يفتح بعد أول محادثة">
      <div className="pb-2">
        <p className="kz-ar-body leading-relaxed text-kz-inkDim">
          محادثة واحدة قصيرة تكفي — وبعدها كل ما هنا مفتوح.
        </p>
        <div className="mt-5">
          <PrimaryAction onClick={() => void startFirstConversation()}>ابدأ أول محادثة</PrimaryAction>
        </div>
        <Button variant="quiet" size="md" fullWidth className="mt-1" onClick={onClose}>
          لاحقاً
        </Button>
      </div>
    </BottomSheet>
  );
};
