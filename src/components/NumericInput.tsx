"use client";

import { useEffect, useState } from "react";

type Props = Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type" | "inputMode" | "pattern" | "max"
> & {
    value: number;
    onChange: (value: number) => void;
    /** Allow a decimal point (prices/costs). Default false = whole numbers only. */
    decimal?: boolean;
    /** Hard ceiling — typed values above it snap back to it. */
    max?: number;
};

/**
 * Numeric text field backed by a raw string, so clearing the box shows ""
 * instead of a sticky "0" and partial decimal entry ("0.", "0.5") survives
 * re-renders. Parents keep plain numeric state: onChange always receives a
 * number (0 when the box is empty).
 */
export function NumericInput({ value, onChange, decimal = false, max, ...rest }: Props) {
    const [text, setText] = useState<string>(() => renderValue(value));

    // Re-sync the displayed string when the parent's value changes externally
    // (form reset, opening an edit modal, parent-side clamping). Skipped when
    // the current string already parses to the incoming value, so mid-typing
    // states like "" or "10." are not clobbered.
    useEffect(() => {
        setText((current) => ((parseFloat(current || "0") || 0) === value ? current : renderValue(value)));
    }, [value]);

    const handleChange = (raw: string) => {
        let sanitized = decimal
            ? raw.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1")
            : raw.replace(/[^0-9]/g, "");
        let parsed = decimal ? parseFloat(sanitized) : parseInt(sanitized, 10);
        if (isNaN(parsed)) parsed = 0;
        if (max !== undefined && parsed > max) {
            parsed = max;
            sanitized = String(max);
        }
        setText(sanitized);
        onChange(parsed);
    };

    return (
        <input
            {...rest}
            type="text"
            inputMode={decimal ? "decimal" : "numeric"}
            pattern={decimal ? undefined : "[0-9]*"}
            value={text}
            onChange={(e) => handleChange(e.target.value)}
        />
    );
}

function renderValue(value: number): string {
    return !Number.isFinite(value) || value === 0 ? "" : String(value);
}
