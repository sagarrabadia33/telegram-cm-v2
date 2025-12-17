'use client';

type DraftTone = 'casual' | 'professional' | 'warm' | 'empathetic';

interface ToneSelectorProps {
  value: DraftTone;
  onChange: (tone: DraftTone) => void;
}

const tones: Array<{ value: DraftTone; label: string }> = [
  { value: 'casual', label: 'Casual' },
  { value: 'professional', label: 'Professional' },
  { value: 'warm', label: 'Warm' },
  { value: 'empathetic', label: 'Empathetic' },
];

export function ToneSelector({ value, onChange }: ToneSelectorProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {tones.map(tone => (
        <button
          key={tone.value}
          onClick={() => onChange(tone.value)}
          style={{
            padding: '4px 8px',
            fontSize: '11px',
            fontWeight: 500,
            color: value === tone.value ? 'var(--text-primary)' : 'var(--text-tertiary)',
            background: value === tone.value ? 'var(--bg-tertiary)' : 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            transition: 'all 100ms',
          }}
        >
          {tone.label}
        </button>
      ))}
    </div>
  );
}
