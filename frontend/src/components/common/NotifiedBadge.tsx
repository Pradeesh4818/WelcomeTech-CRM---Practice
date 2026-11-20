import React from 'react';
import { Mail, MessageCircle } from 'lucide-react';
import { fmt } from '../../utils/helpers';

interface NotifiedBadgeProps {
  date?: string | Date | null;
  channel?: 'email' | 'whatsapp' | string | null;
  templateName?: string | null;
}

export const NotifiedBadge: React.FC<NotifiedBadgeProps> = ({
  date,
  channel,
  templateName,
}) => {
  if (!date) {
    return (
      <span
        style={{
          fontSize: 11,
          color: 'var(--tx-4, #94a3b8)',
          fontStyle: 'italic',
          letterSpacing: '0.2px',
        }}
        title="No notification has been sent yet"
      >
        — Not Sent —
      </span>
    );
  }

  const d = new Date(date);
  const isValid = !Number.isNaN(d.getTime());
  if (!isValid) return <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>—</span>;

  // Format date display: if today, show 'Today', else 'DD MMM YYYY'
  const isToday = new Date().toDateString() === d.toDateString();
  const dateStr = isToday ? 'Today' : fmt.date(date);
  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const isWa = channel === 'whatsapp';
  const channelLabel = isWa ? 'WhatsApp' : 'Email';

  const tooltip = `${channelLabel} sent on ${fmt.date(date)} at ${timeStr}${
    templateName ? `\nTemplate: "${templateName}"` : ''
  }`;

  return (
    <span
      className="badge-notified"
      title={tooltip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        cursor: 'default',
        background: isWa ? 'rgba(16, 185, 129, 0.12)' : 'rgba(124, 58, 237, 0.12)',
        color: isWa ? '#059669' : '#7c3aed',
        border: `1px solid ${isWa ? 'rgba(16, 185, 129, 0.28)' : 'rgba(124, 58, 237, 0.28)'}`,
        transition: 'all 0.15s ease',
      }}
    >
      {isWa ? <MessageCircle size={11} style={{ flexShrink: 0 }} /> : <Mail size={11} style={{ flexShrink: 0 }} />}
      <span>{dateStr}</span>
    </span>
  );
};
