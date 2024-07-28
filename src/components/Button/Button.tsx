import React from "react";
import styles from "./Button.module.scss";
import { cx } from "../../utils/classname";

const Button: React.FC<ButtonProps> = ({
  children,
  icon,
  className,
  type = "primary",
  ...rest
}) => {
  return (
    <button
      className={cx([styles.baseBtn, className, `${type}-type`])}
      {...rest}
    >
      {children}
      {icon && (
        <img src={icon} alt="btn-action" draggable="false" className="icon" />
      )}
    </button>
  );
};

type ButtonProps = React.HTMLAttributes<HTMLButtonElement> & {
  icon?: string;
  type?: "primary" | "secondary" | "tertiary" | "ghost";
};
export default Button;
