"use client";

import { Children, isValidElement, type ReactNode, type SelectHTMLAttributes } from "react";
import { Select } from "@base-ui/react/select";
import { ChevronDown, Circle } from "lucide-react";

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "multiple"> & { onValueChange?: (value: string) => void };
export function ERPSelect({ children, value, defaultValue, onValueChange, name, required, disabled, id, className, ...props }: Props) {
  const options: {value: string; label: ReactNode; disabled: boolean}[] = [];
  function collect(nodes: ReactNode) {
    Children.forEach(nodes, child => {
      if (!isValidElement<{value?: string | number; children?: ReactNode; disabled?: boolean}>(child)) return;
      if (child.type === "option") options.push({value: String(child.props.value ?? child.props.children ?? ""), label: child.props.children, disabled: Boolean(child.props.disabled)});
      else collect(child.props.children);
    });
  }
  collect(children);
  return <Select.Root items={options} name={name} required={required} disabled={disabled} id={id}
    value={value === undefined ? undefined : String(value)} defaultValue={String(defaultValue ?? options.find(o => !o.disabled)?.value ?? "")}
    onValueChange={v => onValueChange?.(v ?? "")}>
    <Select.Trigger className={`erp-control erp-select ${className || ""}`} aria-label={props["aria-label"]}>
      <Select.Value /><Select.Icon className="erp-select-chevron"><ChevronDown className="size-4" /></Select.Icon>
    </Select.Trigger>
    <Select.Portal><Select.Positioner sideOffset={6} className="z-50" alignItemWithTrigger={false}>
      <Select.Popup className="erp-select-popup" dir="rtl"><Select.List className="erp-select-list">
        {options.map(o => <Select.Item key={o.value} value={o.value} disabled={o.disabled} className="erp-select-option">
          <Select.ItemText>{o.label}</Select.ItemText><Select.ItemIndicator className="erp-select-indicator"><Circle className="size-3" /></Select.ItemIndicator>
        </Select.Item>)}
      </Select.List></Select.Popup>
    </Select.Positioner></Select.Portal>
  </Select.Root>;
}
