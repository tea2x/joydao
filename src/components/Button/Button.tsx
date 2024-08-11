import React from "react";
import styles from "./Button.module.scss";
import { cx } from "../../utils/classname";

const Button: React.FC<ButtonProps> = ({
  children,
  icon,
  className,
  type = "primary",
  disabled = false,
  ...rest
}) => {
  return (
    <button
      className={cx([styles.baseBtn, className, `${type}-type`])}
      disabled={disabled}
      {...rest}
    >
      {children && <div className="inside">{children}</div>}
      {icon && (
        <img src={icon} alt="btn-action" draggable="false" className="icon" />
      )}
    </button>
  );
};

type ButtonProps = React.HTMLAttributes<HTMLButtonElement> & {
  icon?: string;
  type?: "primary" | "secondary" | "tertiary" | "ghost" | "glass";
  disabled?: boolean;
};
export default Button;
