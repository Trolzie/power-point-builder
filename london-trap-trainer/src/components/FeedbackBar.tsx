import type { Feedback } from '../types';

const ICON: Record<Feedback['tone'], string> = {
  green: '✓',
  yellow: '≈',
  red: '✕',
  info: 'ℹ',
  neutral: '•',
};

export function FeedbackBar({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null;
  return (
    <div className={`feedback feedback--${feedback.tone}`} role="status" aria-live="polite">
      <span className="feedback__icon" aria-hidden="true">
        {ICON[feedback.tone]}
      </span>
      <div className="feedback__text">
        <strong className="feedback__title">{feedback.title}</strong>
        {feedback.detail && <span className="feedback__detail">{feedback.detail}</span>}
      </div>
    </div>
  );
}
