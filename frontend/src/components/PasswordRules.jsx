import Icon from "./Icon";
import { PASSWORD_RULES } from "../validation";

// Live checklist under a new-password field
export default function PasswordRules({ password }) {
  return (
    <ul className="password-rules" aria-label="Password rules">
      {PASSWORD_RULES.map(([label, ok]) => {
        const met = ok(password);
        return (
          <li key={label} className={met ? "is-met" : ""}>
            <Icon name={met ? "check" : "x"} size={13} /> {label}
            <span className="sr-only">{met ? " (met)" : " (not met)"}</span>
          </li>
        );
      })}
    </ul>
  );
}
