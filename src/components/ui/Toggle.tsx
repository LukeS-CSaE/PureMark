interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  id?: string;
}

/** iOS-style switch. On = theme accent (--primary); Off = --track. */
export default function Toggle({ checked, onChange, label, id }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      className="toggle"
      data-on={checked}
      onClick={() => onChange(!checked)}
    />
  );
}
