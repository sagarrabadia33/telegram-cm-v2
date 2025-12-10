import React from 'react';

interface IconProps {
  className?: string;
  style?: React.CSSProperties;
}

export function SearchIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function SendIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

export function AttachmentIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

export function EmojiIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" x2="9.01" y1="9" y2="9" />
      <line x1="15" x2="15.01" y1="9" y2="9" />
    </svg>
  );
}

export function MoreIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

export function MessageIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function AIIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

export function DocumentIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

export function EditIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function ChecklistIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="6" height="6" rx="1" />
      <path d="m3 17 2 2 4-4" />
      <path d="M13 6h8" />
      <path d="M13 12h8" />
      <path d="M13 18h8" />
    </svg>
  );
}

// Message status icons - like WhatsApp/Telegram
export function SingleCheckIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 16 16" fill="none">
      <path
        d="M3 8l3 3 7-7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DoubleCheckIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 16 16" fill="none">
      <path
        d="M1.5 8l3 3 7-7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 8l3 3 7-7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ClockIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function DownloadIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

// Note type icons for timeline
export function NoteIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2.5C2 1.67 2.67 1 3.5 1H10.5C11.33 1 12 1.67 12 2.5V13.5C12 14.33 11.33 15 10.5 15H3.5C2.67 15 2 14.33 2 13.5V2.5Z" />
      <path d="M4.5 4H9.5" />
      <path d="M4.5 7H9.5" />
      <path d="M4.5 10H7" />
    </svg>
  );
}

export function MeetingIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="14" height="12" rx="2" />
      <path d="M1 6h14" />
      <path d="M5 2v2" />
      <path d="M11 2v2" />
      <path d="M4 9h2v2H4z" />
    </svg>
  );
}

export function CallIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 11.5v2a1.5 1.5 0 01-1.64 1.49 14.88 14.88 0 01-6.49-2.31 14.67 14.67 0 01-4.51-4.51A14.88 14.88 0 01.55 1.64 1.5 1.5 0 012.04.5h2a1.5 1.5 0 011.5 1.29 9.67 9.67 0 00.53 2.12 1.5 1.5 0 01-.34 1.58l-.85.85a12 12 0 004.51 4.51l.85-.85a1.5 1.5 0 011.58-.34 9.67 9.67 0 002.12.53 1.5 1.5 0 011.29 1.5v.81z" />
    </svg>
  );
}

export function FileNoteIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 1H4a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V6L9 1z" />
      <path d="M9 1v5h5" />
    </svg>
  );
}

export function PlusIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

export function TrashIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4m2 0v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4h9.34z" />
    </svg>
  );
}

export function ChevronDownIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

export function CloseIcon({ className = "w-4 h-4", style }: IconProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}
