"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { currencyDisplay, currencyRaw } from "@/lib/currency";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type"> & {
  value?: string | number;
  defaultValue?: string | number;
  onValueChange?: (raw: string) => void;
};
export function CurrencyInput({value, defaultValue = "", onValueChange, name, className = "", min = 0, max = 1e10, step: _step, ...props}: Props) {
  const [local, setLocal] = useState(String(defaultValue));
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const raw = currencyRaw(focused ? local : value ?? local);
  void _step;
  useEffect(() => { input.current?.setCustomValidity(raw && (!/^\d+(\.\d{0,2})?$/.test(raw) || Number(raw) < Number(min) || Number(raw) > Number(max)) ? "راجع القيمة المالية والحد المسموح." : ""); }, [raw, min, max]);
  return <span className={`erp-currency ${className}`}>
    <input {...props} ref={input} type="text" inputMode="decimal" dir="ltr" className="erp-control" value={currencyDisplay(raw, !focused)}
      pattern="[0-9,]+([.][0-9]{0,2})?" aria-label={props["aria-label"]}
      onFocus={() => { setLocal(String(value ?? local)); setFocused(true); }} onBlur={() => setFocused(false)}
      onChange={e => {
        const next = currencyRaw(e.target.value);
        if (!/^\d*(\.\d{0,2})?$/.test(next)) return;
        e.target.setCustomValidity(next && (Number(next) < Number(min) || Number(next) > Number(max)) ? "راجع القيمة المالية والحد المسموح." : "");
        setLocal(next); onValueChange?.(next);
      }} />
    <span aria-hidden="true" className="erp-currency-symbol">ج</span>
    {name && <input type="hidden" name={name} value={raw} disabled={props.disabled} />}
  </span>;
}
