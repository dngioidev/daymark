import React, { useEffect, useRef, useState } from 'react';

type PreviewInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'onInput'> & {
  value: string | number;
  onPreview: (value: string) => void;
  onCommit: (value: string) => void;
};

/** React's range/color onChange fires on input ticks; native change marks a finished edit. */
export function PreviewInput({ value, onPreview, onCommit, ...props }: PreviewInputProps) {
  const [draft, setDraft] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(String(value)), [value]);
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    const commit = () => onCommit(input.value);
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  }, [onCommit, value]);
  return <input {...props} ref={ref} value={draft} onChange={() => {}} onInput={(e) => {
    setDraft(e.currentTarget.value);
    onPreview(e.currentTarget.value);
  }} />;
}
