"use client";

import { useState } from "react";
import clsx from "clsx";
import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { passwordRules, passwordStrength } from "@examora/contract";
import { inputClass } from "@/components/ui";

const levels = [
  { label: "Too weak", bar: "bg-danger", text: "text-danger" },
  { label: "Weak", bar: "bg-danger", text: "text-danger" },
  { label: "Fair", bar: "bg-warning", text: "text-warning" },
  { label: "Good", bar: "bg-info", text: "text-info" },
  { label: "Strong", bar: "bg-success", text: "text-success" },
];

// Password and confirmation, with a strength bar and the rules ticking off as they're met. The values stay in
// the browser across a failed submit, so people don't retype them.
export function PasswordFields() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const strength = passwordStrength(password);
  const level = levels[strength];
  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="password-strength password-rules"
            className={`${inputClass} pr-10`}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted hover:text-foreground"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>

        <div id="password-strength" className="mt-2 flex items-center gap-3" aria-live="polite">
          <div className="flex flex-1 gap-1" aria-hidden>
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={clsx("h-1.5 flex-1 rounded-full transition-colors duration-300", i <= strength ? level.bar : "bg-surface-muted")}
              />
            ))}
          </div>
          <span className={clsx("w-16 text-right text-xs font-medium", password ? level.text : "text-muted")}>
            {password ? level.label : ""}
          </span>
        </div>

        <ul id="password-rules" className="mt-2 space-y-1 text-xs">
          {passwordRules.map((rule) => {
            const met = rule.test(password);
            return (
              <li key={rule.label} className={clsx("flex items-center gap-2 transition-colors", met ? "text-success" : "text-muted")}>
                {met ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3.5" aria-hidden />}
                {rule.label}
                <span className="sr-only">{met ? "(done)" : "(needed)"}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch}
          className={inputClass}
        />
        {confirm.length > 0 && (
          <p className={clsx("mt-1 flex items-center gap-1.5 text-xs", mismatch ? "text-danger" : "text-success")}>
            {mismatch ? "The passwords don't match yet." : <><Check className="size-3.5" aria-hidden /> The passwords match.</>}
          </p>
        )}
      </div>
    </>
  );
}
