import React, { CSSProperties, MouseEventHandler } from "react";
import styles from "./Cell.module.scss";
import { cx } from "../../utils/classname";
import { useMemo } from "react";

const VALUE_THRESHOLD_1 = 50000;
const VALUE_THRESHOLD_2 = 500000;

const Cell: React.FC<CellProps> = ({
  className,
  type,
  value,
  selected = false,
  progress,
  isRipe = false,
  animationDelay = 0,
  onClick,
  onCellAction,
  onSelectCell,
  onExploringTransaction,
  ...rest
}) => {
  const size = useMemo(() => {
    // if (window.innerWidth <= 1024) {
    //   return "small";
    // }
    
    switch (true) {
      case value < VALUE_THRESHOLD_1: {
        return "small";
      }
      case value < VALUE_THRESHOLD_2: {
        return "medium";
      }
      default: {
        return "large";
      }
    }
  }, [value]);

  const isDeposit = useMemo(() => type === "deposit", [type]);

  return (
    <div
      className={cx([
        styles.daoCell,
        className,
        `${type}-type`,
        `${size}-size`,
        selected && "selected",
        isRipe && "ripe",
      ])}
      onClick={onSelectCell}
      style={
        {
          "--progress": `${progress * 3.6}deg`,
          "--animationDelay": `${animationDelay}s`,
        } as CSSProperties
      }
    >
      <button className="explore-transaction" onClick={onExploringTransaction}>
        <img
          src={
            isDeposit
              ? require("../../assets/icons/globe-deposit.svg").default
              : require("../../assets/icons/globe-withdraw.svg").default
          }
          draggable="false"
          alt="globe"
        />
      </button>

      <div className="amount">
        <span>
          {value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} CKB
        </span>
      </div>
      <button className="dao-cell-btn" onClick={onCellAction}>
        <span className="btn-text">
          {isRipe ? "Completed" : isDeposit ? "Withdraw" : "Processing"}
        </span>
        <img
          src={
            isRipe
              ? isDeposit
                ? require("../../assets/icons/selected-deposit.svg").default
                : require("../../assets/icons/selected-withdraw.svg").default
              : isDeposit
              ? require("../../assets/icons/getout-deposit.svg").default
              : require("../../assets/icons/withdraw-processing.svg").default
          }
          className="btn-icon"
          draggable="false"
          alt="mine"
        />
      </button>
    </div>
  );
};

type CellProps = React.HTMLAttributes<HTMLDivElement> & {
  type: "deposit" | "withdraw";
  progress: number;
  value: number;
  selected?: boolean;
  isRipe?: boolean;
  animationDelay?: number;
  onCellAction: MouseEventHandler<HTMLButtonElement>;
  onSelectCell: MouseEventHandler<HTMLDivElement>;
  onExploringTransaction: MouseEventHandler<HTMLButtonElement>;
};

export default React.memo(Cell);
