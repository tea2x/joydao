import { ccc } from "@ckb-ccc/connector-react";
import { ClientPublicMainnet, ClientPublicTestnet } from "@ckb-ccc/core";
import { blockchain, utils } from "@ckb-lumos/base";
import { Config, initializeConfig } from "@ckb-lumos/config-manager";
import { CKBTransaction } from "@joyid/ckb";
import * as React from "react";
import { buildTransfer } from "./basic-wallet";
import {
  Balance,
  DaoCell,
  SeededRandom,
  enrichDaoCellInfo,
  estimateReturn,
  getTipEpoch,
  isDefaultAddress,
  isJoyIdAddress,
  isOmnilockAddress,
  queryBalance,
  waitForTransactionConfirmation,
} from "./lib/helpers";

import {
  CKB_SHANNON_RATIO,
  DAO_MINIMUM_CAPACITY,
  EXPLORER_PREFIX,
  ISMAINNET,
  NETWORK_CONFIG,
} from "./config";

import {
  batchDaoCells,
  buildDepositTransaction,
  buildUnlockTransaction,
  buildWithdrawTransaction,
  collectDeposits,
  collectWithdrawals,
} from "./joy-dao";

import { SnackbarProvider, useSnackbar } from "notistack";
import { CircularProgressbarWithChildren } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";

import Modal from "react-modal";
import "./App.css";
import gradientLogo from "./assets/icons/logo.svg";
import bgGuestLogin01 from "./assets/images/bg-login-01.jpeg";
import { Button, Input } from "./components";
import "./index.scss";

Modal.setAppElement("#root");

import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import Cell from "./components/Cell";
import { useOnClickOutside } from "./hooks";
import { cx } from "./utils/classname";

const { ckbHash } = utils;

enum DaoFunction {
  none = 0,
  depositing = 1,
  withdrawing = 2,
  unlocking = 3,
}

const App = () => {
  const [balance, setBalance] = React.useState<Balance | null>(null);
  const [ckbAddress, setCkbAddress] = React.useState("");
  const [depositCells, setDepositCells] = React.useState<DaoCell[]>([]);
  const [withdrawalCells, setWithdrawalCells] = React.useState<DaoCell[]>([]);
  const depositCellsRef = React.useRef(depositCells);
  const withdrawalCellsRef = React.useRef(withdrawalCells);
  const [windowWidth, setWindowWidth] = React.useState(window.innerWidth);
  const [renderKick, setRenderKick] = React.useState<number>(0);
  const [pickedCells, setPickedCells] = React.useState<DaoCell[]>([]);

  const [depositAmount, setDepositAmount] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isWaitingTxConfirm, setIsWaitingTxConfirm] = React.useState(false);
  const [modalIsOpen, setModalIsOpen] = React.useState(false);
  const [pickedDaoCell, setPickedDaoCell] = React.useState<DaoCell | null>(
    null
  );
  const [currentTx, setCurrentTx] = React.useState<{
    tx: CKBTransaction | null;
    fee: number;
  }>({ tx: null, fee: 0 });
  const [daoMode, setDaoMode] = React.useState<DaoFunction | null>(
    DaoFunction.none
  );
  const [tipEpoch, setTipEpoch] = React.useState<number | null>(null);
  const [isDaoTransitMsgLoading, setIsDaoTransitMsgLoading] =
    React.useState(false);
  const [compensation, setCompensation] = React.useState<number | null>(null);
  const [percentageLoading, setPercentageLoading] = React.useState<number>(0);

  // basic wallet
  const [transferTo, setTransferTo] = React.useState<string>("");
  const [transferAmount, setTransferAmount] = React.useState<string>("");

  const { open, disconnect, setClient } = ccc.useCcc();
  const signer = ccc.useSigner();
  const { enqueueSnackbar } = useSnackbar();

  initializeConfig(NETWORK_CONFIG as Config);

  /**
   * Sum up deposits.
   */
  const sumDeposit = () => {
    const sum = [...depositCells].reduce(
      (sum, c) => sum + parseInt(c.cellOutput.capacity, 16),
      0
    );
    return sum;
  };

  /**
   * Sum up locked amount.
   */
  const sumLocked = () => {
    const sum = [...withdrawalCells].reduce(
      (sum, c) => sum + parseInt(c.cellOutput.capacity, 16),
      0
    );
    return sum;
  };

  /**
   * Get compensation and convert to string.
   */
  const getCompensation = (cell: DaoCell): string => {
    if (!cell.maximumWithdraw) return " ~ CKB";

    const compensation =
      parseInt(cell?.maximumWithdraw) - parseInt(cell?.cellOutput.capacity, 16);
    return (compensation / CKB_SHANNON_RATIO).toFixed(2).toString() + " CKB";
  };

  /**
   * Fetching joyDAO information. There're for modes:
   * - deposit: update deposits
   * - withdraw: update withdraw
   * - balance: update balance
   * - all: update all 3 information
   */
  const updateJoyDaoInfo = async (
    type: "all" | "deposit" | "withdraw" | "balance"
  ) => {
    const storedCkbAddress = localStorage.getItem("ckbAddress");
    if (storedCkbAddress) {
      try {
        let balance, deposits, withdrawals;
        if (type == "all") {
          [balance, deposits, withdrawals] = await Promise.all([
            queryBalance(storedCkbAddress),
            collectDeposits(storedCkbAddress),
            collectWithdrawals(storedCkbAddress),
          ]);

          setBalance(balance);
          setDepositCells(deposits as DaoCell[]);
          setWithdrawalCells(withdrawals as DaoCell[]);

          localStorage.setItem("balance", JSON.stringify(balance));
          localStorage.setItem("depositCells", JSON.stringify(deposits));
          localStorage.setItem("withdrawalCells", JSON.stringify(withdrawals));
        } else if (type == "deposit") {
          [balance, deposits] = await Promise.all([
            queryBalance(storedCkbAddress),
            collectDeposits(storedCkbAddress),
          ]);

          setBalance(balance);
          setDepositCells(deposits as DaoCell[]);

          localStorage.setItem("balance", JSON.stringify(balance));
          localStorage.setItem("depositCells", JSON.stringify(deposits));
        } else if (type == "withdraw") {
          [balance, withdrawals] = await Promise.all([
            queryBalance(storedCkbAddress),
            collectWithdrawals(storedCkbAddress),
          ]);

          setBalance(balance);
          setWithdrawalCells(withdrawals as DaoCell[]);

          localStorage.setItem("balance", JSON.stringify(balance));
          localStorage.setItem("withdrawalCells", JSON.stringify(withdrawals));
        } else {
          // load balance
          const balance = await queryBalance(storedCkbAddress);
          setBalance(balance);
          localStorage.setItem("balance", JSON.stringify(balance));
        }
      } catch (e: any) {
        enqueueSnackbar("Error: " + e.message, { variant: "error" });
      }
    }
  };

  /**
   * Query DAO information from CKB and settle to the state variables.
   */
  const settleUserInfo = async (ckbAddress: string) => {
    setIsLoading(true);
    try {
      const [balance, deposits, withdrawals, epoch] = await Promise.all([
        queryBalance(ckbAddress),
        collectDeposits(ckbAddress),
        collectWithdrawals(ckbAddress),
        getTipEpoch(),
      ]);

      setCkbAddress(ckbAddress);
      setBalance(balance);
      setDepositCells(deposits as DaoCell[]);
      setWithdrawalCells(withdrawals as DaoCell[]);
      setIsLoading(false);
      setTipEpoch(epoch);

      localStorage.setItem("ckbAddress", ckbAddress);
      localStorage.setItem("balance", JSON.stringify(balance));
      localStorage.setItem("depositCells", JSON.stringify(deposits));
      localStorage.setItem("withdrawalCells", JSON.stringify(withdrawals));
    } catch (e: any) {
      enqueueSnackbar("Error: " + e.message, { variant: "error" });
    }
  };

  /**
   * Processing transaction batching.
   */
  const onBatch = async (cells: DaoCell[]) => {
    try {
      if (!signer) throw new Error("Wallet disconnected. Reconnect!");

      const batchTx = await batchDaoCells(signer, cells);

      // might be over-cautious, but worth checking with utxo
      // TODO remove when fully support fee-rate configuration
      if (batchTx!.fee > 1 * CKB_SHANNON_RATIO)
        throw new Error("Paying too much transaction fee");

      const txid = await signer.sendTransaction(batchTx.tx);
      enqueueSnackbar(`Transaction Sent: ${txid}`, { variant: "success" });
      setIsWaitingTxConfirm(true);
      setIsLoading(true);
      await waitForTransactionConfirmation(txid);
      setIsWaitingTxConfirm(false);
      await updateJoyDaoInfo("all");
      setIsLoading(false);
      setPickedCells([]);
    } catch (e: any) {
      enqueueSnackbar("Error: " + e.message, { variant: "error" });
    } finally {
      setSidebarMode(0);
    }
  };

  /**
   * Processing transfer.
   */
  const onTransfer = async () => {
    if (transferAmount == "") {
      enqueueSnackbar("Please fill address and amount!", { variant: "error" });
      return;
    } else if (!/^[0-9]+$/.test(transferAmount)) {
      enqueueSnackbar("Please input a valid numeric amount!", {
        variant: "error",
      });
      return;
    }

    try {
      // output readable error for common cases
      if (
        (isJoyIdAddress(transferTo) || isOmnilockAddress(transferTo)) &&
        parseInt(transferAmount) < 63
      ) {
        enqueueSnackbar(
          "Your receiver address requires a minimum amount of 63CKB",
          {
            variant: "error",
          }
        );
        return;
      } else if (
        isDefaultAddress(transferTo) &&
        parseInt(transferAmount) < 61
      ) {
        enqueueSnackbar(
          "Your receiver address requires a minimum amount of 61CKB",
          {
            variant: "error",
          }
        );
        return;
      }

      if (!signer) throw new Error("Wallet disconnected. Reconnect!");

      const transferTx = await buildTransfer(
        signer!,
        transferTo,
        transferAmount
      );
      const txid = await signer.sendTransaction(transferTx);

      enqueueSnackbar(`Transaction Sent: ${txid}`, { variant: "success" });
      setIsWaitingTxConfirm(true);
      setIsLoading(true);
      await waitForTransactionConfirmation(txid);
      setIsWaitingTxConfirm(false);
      setTransferTo("");
      setTransferAmount("");
      await updateJoyDaoInfo("balance");
      setIsLoading(false);
    } catch (e: any) {
      enqueueSnackbar("Error: " + e.message, { variant: "error" });
    } finally {
      setSidebarMode(0);
    }
  };

  /**
   * Built deposit transaction for tx submission in the next step.
   */
  const preBuildDeposit = async () => {
    let daoTx: { tx: CKBTransaction | null; fee: number } =
      await buildDepositTransaction(signer, BigInt(depositAmount));

    // might be over-cautious, but worth checking with utxo
    // TODO remove when fully support fee-rate configuration
    if (daoTx!.fee > 1 * CKB_SHANNON_RATIO)
      throw new Error("Paying too much transaction fee");

    setCurrentTx(daoTx!);
  };

  /**
   * Built withdraw transaction for tx submission in the next step.
   */
  const preBuildWithdraw = async (depositCell: DaoCell) => {
    let daoTx: { tx: CKBTransaction | null; fee: number } =
      await buildWithdrawTransaction(signer, depositCell);

    // might be over-cautious, but worth checking with utxo
    // TODO remove when fully support fee-rate configuration
    if (daoTx!.fee > 1 * CKB_SHANNON_RATIO)
      throw new Error("Paying too much transaction fee");

    setCurrentTx(daoTx!);
  };

  /**
   * Built unlock transaction for tx submission in the next step.
   */
  const preBuildUnlock = async (withdrawalCell: DaoCell) => {
    let daoTx: { tx: CKBTransaction | null; fee: number } =
      await buildUnlockTransaction(signer, withdrawalCell);

    // might be over-cautious, but worth checking with utxo
    // TODO remove when fully support fee-rate configuration
    if (daoTx!.fee > 1 * CKB_SHANNON_RATIO)
      throw new Error("Paying too much transaction fee");

    setCurrentTx(daoTx!);
  };

  /**
   * Deposit button handler.
   */
  const onDeposit = async () => {
    try {
      if (!signer) throw new Error("Wallet disconnected. Reconnect!");

      if (!balance || balance.available === "0")
        throw new Error("Empty balance!");

      if (depositAmount == "") {
        enqueueSnackbar("Please input amount!", { variant: "error" });
        return;
      } else if (!/^[0-9]+$/.test(depositAmount)) {
        enqueueSnackbar("Please input a valid numeric amount!", {
          variant: "error",
        });
        return;
      }

      if (
        parseInt(depositAmount) * CKB_SHANNON_RATIO >
        parseInt(balance.available)
      )
        throw new Error("Insufficient balance!");

      if (parseInt(depositAmount) < DAO_MINIMUM_CAPACITY) {
        throw new Error("Minimum joyDAO deposit is 104 CKB.");
      }

      setDaoMode(DaoFunction.depositing);
      setModalIsOpen(true);
      setIsDaoTransitMsgLoading(true);
      await preBuildDeposit();
      setIsDaoTransitMsgLoading(false);
    } catch (e: any) {
      enqueueSnackbar("Error: " + e.message, { variant: "error" });
    }
  };

  /**
   * Deposit modal proceed button handler.
   */
  const onDepositProceed = async () => {
    try {
      if (!currentTx.tx) throw new Error("Transaction building has failed");

      const txid = await signer.sendTransaction(currentTx.tx);
      enqueueSnackbar(`Transaction Sent: ${txid}`, { variant: "success" });
      setIsWaitingTxConfirm(true);
      setIsLoading(true);
      await waitForTransactionConfirmation(txid);
      setIsWaitingTxConfirm(false);
      setDepositAmount("");
      await updateJoyDaoInfo("deposit");
      setIsLoading(false);
    } catch (e: any) {
      enqueueSnackbar("Error: " + e.message, { variant: "error" });
    }
  };

  /**
   * Withdraw button handler.
   */
  const onWithdraw = async (cell: DaoCell) => {
    try {
      if (!signer) throw new Error("Wallet disconnected. Reconnect!");

      if (isLoading)
        throw new Error(
          "Please wait a moment! joyDAO is fetching data for you."
        );

      setDaoMode(DaoFunction.withdrawing);
      setModalIsOpen(true);
      setIsDaoTransitMsgLoading(true);
      await preBuildWithdraw(cell);
      setPickedDaoCell(cell);
      setIsDaoTransitMsgLoading(false);
    } catch (e: any) {
      enqueueSnackbar("Error: " + e.message, { variant: "error" });
    }
  };

  /**
   * Withdraw modal proceed button handler
   */
  const onWithdrawProceed = async () => {
    try {
      if (!currentTx.tx) throw new Error("Transaction building has failed");

      const txid = await signer.sendTransaction(currentTx.tx);
      enqueueSnackbar(`Transaction Sent: ${txid}`, { variant: "success" });
      setIsWaitingTxConfirm(true);
      setIsLoading(true);
      await waitForTransactionConfirmation(txid);
      setIsWaitingTxConfirm(false);
      await updateJoyDaoInfo("all");
      setIsLoading(false);
      setPickedDaoCell(null);
    } catch (e: any) {
      enqueueSnackbar("Error: " + e.message, { variant: "error" });
    }
  };

  /**
   * Unlock button handler.
   */
  const onUnlock = async (cell: DaoCell) => {
    try {
      if (!signer) throw new Error("Wallet disconnected. Reconnect!");

      if (isLoading)
        throw new Error(
          "Please wait a moment! joyDAO is fetching data for you."
        );

      setDaoMode(DaoFunction.unlocking);
      setModalIsOpen(true);
      setIsDaoTransitMsgLoading(true);
      if (cell.ripe) await preBuildUnlock(cell);
      setPickedDaoCell(cell);
      setIsDaoTransitMsgLoading(false);
    } catch (e: any) {
      enqueueSnackbar("Error: " + e.message, { variant: "error" });
    }
  };

  /**
   * Unlock modal proceed button handler.
   */
  const onUnlockProceed = async () => {
    try {
      if (!currentTx.tx) throw new Error("Transaction building has failed");

      const txid = await signer.sendTransaction(currentTx.tx);
      enqueueSnackbar(`Transaction Sent: ${txid}`, { variant: "success" });
      setIsWaitingTxConfirm(true);
      setIsLoading(true);
      await waitForTransactionConfirmation(txid);
      setIsWaitingTxConfirm(false);
      await updateJoyDaoInfo("withdraw");
      setIsLoading(false);
      setPickedDaoCell(null);
    } catch (e: any) {
      enqueueSnackbar("Error: " + e.message, { variant: "error" });
    }
  };

  /**
   * Sign out button handler.
   */
  const onSignOut = async () => {
    disconnect();
    setCkbAddress("");
    setBalance(null);
    setDepositCells([]);
    setWithdrawalCells([]);
    setIsLoading(false);

    localStorage.removeItem("joyidInfo");
    localStorage.removeItem("ckbAddress");
    localStorage.removeItem("balance");
    localStorage.removeItem("depositCells");
    localStorage.removeItem("withdrawalCells");
  };

  /**
   * Shorten address.
   */
  const shortenAddress = (address: string) => {
    if (!address) return "";
    if (windowWidth <= 768) {
      return `${address.slice(0, 7)}...${address.slice(-10)}`;
    } else {
      return `${address.slice(0, 7)}...${address.slice(-10)}`;
    }
  };

  /**
   * handle deposit when enter button is pressed.
   */
  const handleDepositKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onDeposit();
    }
  };

  /**
   * Copy address to cliploarb
   */
  const copyAddress = (address: string) => {
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(address)
        .then(() => {
          enqueueSnackbar("Address copied to clipboard", { variant: "info" });
        })
        .catch((err) => {
          enqueueSnackbar("Could not copy address", { variant: "error" });
        });
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = address;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } catch (err) {
        enqueueSnackbar("Could not copy address", { variant: "error" });
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };

  /**
   * Enriching DAO dell information
   */
  React.useEffect(() => {
    if (!tipEpoch || !depositCells || !withdrawalCells) return;

    try {
      if (depositCellsRef.current !== depositCells) {
        Promise.all(
          depositCells.map(async (cell) => {
            await enrichDaoCellInfo(cell as DaoCell, true, tipEpoch!);
          })
        ).then(() => {
          depositCellsRef.current = depositCells;
          // kick re-renderring when enriching process's done
          setRenderKick((prevRenderKick) => prevRenderKick + 1);
        });
      }

      if (withdrawalCellsRef.current !== withdrawalCells) {
        Promise.all(
          withdrawalCells.map(async (cell) => {
            await enrichDaoCellInfo(cell as DaoCell, false, tipEpoch!);
          })
        ).then(() => {
          withdrawalCellsRef.current = withdrawalCells;
          // kick re-renderring when enriching process's done
          setRenderKick((prevRenderKick) => prevRenderKick + 1);
        });
      }
    } catch (e: any) {
      if (e.message.includes("Network request failed")) {
        enqueueSnackbar(
          "joyDAO is chasing down your data. Refresh and give it another go!",
          { variant: "info" }
        );
      } else {
        enqueueSnackbar("Error: " + e.message, { variant: "error" });
      }
    }
  }, [depositCells, withdrawalCells, tipEpoch]);

  /**
   * When page refreshed, fetch from localstorage
   */
  React.useEffect(() => {
    const storedCkbAddress = localStorage.getItem("ckbAddress");
    const storedBalance = localStorage.getItem("balance");
    const storedDepositCells = localStorage.getItem("depositCells");
    const storedWithdrawalCells = localStorage.getItem("withdrawalCells");

    if (storedCkbAddress) {
      setCkbAddress(storedCkbAddress);
    }
    if (storedBalance) {
      setBalance(JSON.parse(storedBalance));
    }
    if (storedDepositCells) {
      setDepositCells(JSON.parse(storedDepositCells));
    }
    if (storedWithdrawalCells) {
      setWithdrawalCells(JSON.parse(storedWithdrawalCells));
    }
  }, []);

  /**
   * Check device window width
   */
  React.useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });

  /**
   * Set CKB address
   */
  React.useEffect(() => {
    if (!signer) {
      setCkbAddress("");
      return;
    }

    (async () => {
      setCkbAddress(await signer.getRecommendedAddress());
      // setBalance(await signer.getBalance());
    })();
  }, [signer]);

  /**
   * Query and settle joyDAO states variables
   */
  React.useEffect(() => {
    if (ckbAddress) settleUserInfo(ckbAddress);
  }, [ckbAddress]);

  /**
   * Client control. Effective when deployment only
   */
  React.useEffect(() => {
    if (ISMAINNET) setClient(new ClientPublicMainnet());
    else setClient(new ClientPublicTestnet());
  }, [setClient, ISMAINNET]);

  /**
   * Estimate return based on tip epoch and current picked joyDao cell
   */
  React.useEffect(() => {
    if (!tipEpoch || !pickedDaoCell) return;

    if (!pickedDaoCell.isDeposit) return;

    const fetchData = async () => {
      const totalReturn = await estimateReturn(pickedDaoCell, tipEpoch);
      const compensation =
        totalReturn -
        parseInt(pickedDaoCell.cellOutput.capacity, 16) / CKB_SHANNON_RATIO;
      setCompensation(compensation);
    };
    fetchData();
  }, [tipEpoch, pickedDaoCell]);

  /**
   * Creating a loading effect on deposit button
   */
  React.useEffect(() => {
    if (!signer) {
      return;
    }

    if (!tipEpoch || (!depositCells && !withdrawalCells)) {
      return;
    }

    if (
      depositCellsRef.current == depositCells ||
      withdrawalCellsRef.current == withdrawalCells
    ) {
      return;
    }

    const interval = setInterval(() => {
      setPercentageLoading((prevPercentage) => {
        return prevPercentage === 100 ? 1 : prevPercentage + 1;
      });
    }, 5);

    return () => clearInterval(interval);
  }, [depositCells, withdrawalCells, tipEpoch, percentageLoading]);

  // Sidebar Mode
  // 0. default
  // 1. transfer
  // 2. deposit
  // 3. batch
  const [sidebarMode, setSidebarMode] = React.useState(0);

  /**
   * joyDAO front information board UI
   */
  const accountBalances = () => {
    return (
      <div className="balances">
        <div className="balance-background"></div>
        {(sidebarMode === 1 || sidebarMode === 0) && (
          <p className="balance-index free-balance">
            <span>Free</span>
            <span>
              {balance
                ? (BigInt(balance.available) / BigInt(CKB_SHANNON_RATIO))
                    .toString()
                    .replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " CKB"
                : "Loading..."}
            </span>
          </p>
        )}
        {sidebarMode === 0 && (
          <>
            <p className="balance-index depositing-balance">
              <span>Depositing</span>
              <span>
                {balance
                  ? (sumDeposit() / CKB_SHANNON_RATIO)
                      .toString()
                      .replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " CKB"
                  : "Loading..."}
              </span>
            </p>

            <p className="balance-index withdrawing-balance">
              <span>Withdrawing</span>
              <span>
                {balance
                  ? (sumLocked() / CKB_SHANNON_RATIO)
                      .toString()
                      .toString()
                      .replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " CKB"
                  : "Loading..."}
              </span>
            </p>
          </>
        )}
      </div>
    );
  };

  const depositForm = () => {
    return (
      <div className="deposit-form">
        <div className="form-header">
          <Button
            type="ghost"
            icon={require("./assets/icons/back.svg").default}
            onClick={() => setSidebarMode(0)}
          />
          <h3>
            <span className="highlight-txt">Deposit CKB</span>
            <span>to Nervos DAO</span>
          </h3>
        </div>
        <Input
          className="form-field"
          htmlType="text"
          value={depositAmount}
          onChange={(e) => setDepositAmount(e.target.value)}
          onKeyDown={handleDepositKeyDown}
          placeholder="Deposit amount"
          leadIcon={require("./assets/icons/zap.svg").default}
        />
        <Button className="submit" type="glass" onClick={() => onDeposit()}>
          Execute
        </Button>
      </div>
    );
  };

  const transferForm = () => {
    return (
      <div className="transfer-form">
        <div className="form-header">
          <Button
            type="ghost"
            icon={require("./assets/icons/back.svg").default}
            onClick={() => setSidebarMode(0)}
          />
          <h3>
            <span className="highlight-txt">Transfer</span>
            <span>to destination address</span>
          </h3>
        </div>
        <Input
          className="form-field"
          htmlType="text"
          value={transferTo}
          onInput={(e) => setTransferTo(e.currentTarget.value)}
          placeholder="Destination address"
          leadIcon={require("./assets/icons/user.svg").default}
        />
        <Input
          className="form-field"
          htmlType="text"
          value={transferAmount}
          onInput={(e) => setTransferAmount(e.currentTarget.value)}
          placeholder="Amount of transfer"
          leadIcon={require("./assets/icons/zap.svg").default}
        />
        <Button className="submit" type="glass" onClick={() => onTransfer()}>
          Execute
        </Button>
      </div>
    );
  };

  const batchForm = () => {
    return (
      <div className="transfer-form">
        <div className="form-header">
          <Button
            type="ghost"
            icon={require("./assets/icons/back.svg").default}
            onClick={() => {
              setPickedCells([]);
              setSidebarMode(0);
            }}
          />
          <h3>
            <span className="highlight-txt">Batch</span>
            <span>{`${pickedCells.length} ${
              pickedCells.length > 1 ? " transactions" : " transaction"
            }`}</span>
          </h3>
        </div>
        {pickedCells.length === 0 && (
          <p>
            <i>Please select cells</i>
          </p>
        )}
        {pickedCells.length === 1 && (
          <p>
            <i>Please select at least 2 cells</i>
          </p>
        )}
        <Button
          className="submit"
          type="glass"
          onClick={() => onBatch(pickedCells)}
          disabled={pickedCells.length < 2}
        >
          Execute
        </Button>
      </div>
    );
  };

  /**
   * joyDAO deposit information UI
   */
  function daoDepositCircularProgressBarInfo() {
    return (
      <div className="deposit-circular-progress-bar">
        <svg style={{ height: 0, width: "100%" }}>
          <defs>
            <linearGradient
              id="deposit_progress"
              x1="0.5"
              y1="26.5"
              x2="26.5"
              y2="0.5"
              gradientUnits="userSpaceOnUse"
            >
              <stop stop-color="#82DBF7" />
              <stop offset="1" stop-color="#B6F09C" />
            </linearGradient>
          </defs>
          <defs>
            <linearGradient
              id="withdraw_progress"
              x1="0.5"
              y1="26"
              x2="26.5"
              y2="-3.74348e-07"
              gradientUnits="userSpaceOnUse"
            >
              <stop stop-color="#CA6100" />
              <stop offset="1" stop-color="#FF9900" />
            </linearGradient>
          </defs>
        </svg>
        <CircularProgressbarWithChildren
          value={pickedDaoCell?.currentCycleProgress!}
          styles={{
            path: {
              stroke: `url(#${
                pickedDaoCell?.currentCycleProgress! < 93
                  ? "deposit_progress"
                  : "withdraw_progress"
              })`,
              height: "100%",
            },
            trail: {
              stroke: "#2e2e2e",
            },
          }}
        >
          {!isDaoTransitMsgLoading && (
            <>
              <p className="dao-transition-message">
                Cycle{" "}
                {pickedDaoCell
                  ? !pickedDaoCell?.isDeposit && pickedDaoCell?.ripe
                    ? pickedDaoCell?.completedCycles!
                    : pickedDaoCell?.completedCycles! + 1
                  : "~"}{" "}
                | Progress:{" "}
                {pickedDaoCell
                  ? pickedDaoCell.currentCycleProgress! + "%"
                  : "~"}
              </p>

              {!pickedDaoCell?.isDeposit && (
                <p className="dao-transition-message">
                  Compensation:{" "}
                  {pickedDaoCell ? getCompensation(pickedDaoCell) : "~"}
                </p>
              )}

              {!pickedDaoCell?.isDeposit &&
                (!pickedDaoCell?.ripe ? (
                  <p className="dao-transition-message highlight">
                    Complete in:{" "}
                    {pickedDaoCell
                      ? (pickedDaoCell?.cycleEndInterval! + 1) / 6 > 2
                        ? `${(
                            (pickedDaoCell?.cycleEndInterval! + 1) /
                            6
                          ).toFixed(2)}d`
                        : `${(pickedDaoCell?.cycleEndInterval! + 1) * 4}h`
                      : "~"}
                  </p>
                ) : (
                  <p className="dao-transition-message highlight">
                    Complete now!
                  </p>
                ))}

              {pickedDaoCell?.isDeposit && (
                <p className="dao-transition-message">
                  Compensation:{" "}
                  {compensation != null
                    ? `${compensation?.toFixed(2)} CKB`
                    : "~"}
                </p>
              )}

              {pickedDaoCell?.isDeposit && pickedDaoCell.ripe && (
                <p className="dao-transition-message highlight">
                  New Lock Cycle in: {pickedDaoCell?.cycleEndInterval! * 4}h
                </p>
              )}

              {pickedDaoCell?.isDeposit &&
                (!pickedDaoCell.ripe ? (
                  <p className="dao-transition-message highlight">
                    Max Reward in:{" "}
                    {pickedDaoCell?.cycleEndInterval! >= 12 &&
                    (pickedDaoCell?.cycleEndInterval! - 12) / 6 > 2
                      ? `${(
                          (pickedDaoCell?.cycleEndInterval! - 12) /
                          6
                        ).toFixed(2)}d`
                      : `${(pickedDaoCell?.cycleEndInterval! - 12) * 4}h`}
                  </p>
                ) : (
                  <p className="dao-transition-message highlight">
                    Withdraw now!
                  </p>
                ))}

              {!(!pickedDaoCell?.isDeposit && !pickedDaoCell?.ripe) && (
                <p className="dao-transition-message">
                  Tx fee:{" "}
                  {currentTx.fee
                    ? `${(currentTx.fee / CKB_SHANNON_RATIO).toFixed(8)} CKB`
                    : `${" ~ CKB"}`}
                </p>
              )}
            </>
          )}
        </CircularProgressbarWithChildren>
      </div>
    );
  }

  /**
   * joyDAO deposit transition messsage UI
   */
  function depositTransitionMessage() {
    return (
      <div className="deposit-confirmation-modal">
        <h2 className="highlight-txt">Depositing {depositAmount} CKB</h2>
        <div className="description">
          <p className="dao-transition-message deposit">
            Withdrawals can be initiated any time later on but each withdrawal
            is only completed at the end of its{" "}
            <span className="highlight-txt">30-day</span> cycle
          </p>
          <p className="dao-transition-message deposit">
            Tx fee:{" "}
            <span className="highlight-txt">
              {currentTx.fee
                ? `${(currentTx.fee / CKB_SHANNON_RATIO).toFixed(8)} CKB`
                : `${" ~ CKB"}`}
            </span>
          </p>
        </div>
      </div>
    );
  }

  /**
   * joyDAO information transit modal UI
   */
  function daoTransitInfoModal() {
    return (
      <Modal
        isOpen={modalIsOpen}
        onRequestClose={() => {
          setModalIsOpen(false);
          setPickedDaoCell(null);
        }}
        shouldCloseOnOverlayClick
        shouldCloseOnEsc
      >
        {daoMode == DaoFunction.depositing
          ? depositTransitionMessage()
          : daoDepositCircularProgressBarInfo()}

        {!isDaoTransitMsgLoading && (
          <div className="modal-btns">
            <button
              className="proceed"
              disabled={
                daoMode == DaoFunction.unlocking && pickedDaoCell
                  ? !pickedDaoCell.isDeposit && !pickedDaoCell.ripe
                  : false
              }
              onClick={() => {
                if (daoMode == DaoFunction.withdrawing) {
                  onWithdrawProceed();
                } else if (daoMode == DaoFunction.unlocking) {
                  onUnlockProceed();
                } else if (daoMode == DaoFunction.depositing) {
                  onDepositProceed();
                } else {
                  //nothing
                }
                setModalIsOpen(false);
                setDaoMode(DaoFunction.none);
              }}
            >
              Proceed
            </button>
          </div>
        )}
      </Modal>
    );
  }

  // in case there're too few deposit, fill up dummy cells

  const [mouseDown, setMouseDown] = React.useState(false);

  const handleMouseDown = () => {
    setMouseDown(true);
  };

  const handleMouseUp = () => {
    setMouseDown(false);
  };

  React.useEffect(() => {
    if (/Mobi|Android/i.test(window.navigator.userAgent)) {
      window.addEventListener("mousedown", handleMouseDown);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousedown", handleMouseDown);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, []);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState<Boolean>(
    !!Number(localStorage.getItem("isSidebarCollapse"))
  );

  const cells = React.useMemo(
    () =>
      [...depositCells, ...withdrawalCells].sort(
        (a, b) => parseInt(b.blockNumber!, 16) - parseInt(a.blockNumber!, 16)
      ),
    [depositCells, withdrawalCells]
  );

  const onExploringCell = (cell: any) => {
    window.open(
      EXPLORER_PREFIX + `${cell.outPoint?.txHash}`,
      "_blank",
      "noreferrer"
    );
  };

  const onSelectCell = (e: any, cell: any) => {
    e.stopPropagation();
    try {
      if (isLoading)
        throw new Error(
          "Please wait a moment! joyDAO is fetching data for you."
        );

      if (!pickedCells.includes(cell)) {
        if (!cell.isDeposit && !cell.ripe)
          throw new Error("Can not batch processing withdrawals");

        pickedCells.push(cell);
        setPickedCells(pickedCells);
        setRenderKick((prevRenderKick) => prevRenderKick + 1);
      } else {
        // remove cell if re-picked
        const index = pickedCells.indexOf(cell);
        if (index !== -1) {
          pickedCells.splice(index, 1);
          setPickedCells(pickedCells);
          setRenderKick((prevRenderKick) => prevRenderKick + 1);
        }
      }
    } catch (e: any) {
      enqueueSnackbar("Error: " + e.message, {
        variant: "error",
      });
    }
  };

  const sidebarRef = React.useRef(null);

  useOnClickOutside(sidebarRef, () => {
    const isFirstDeposit =
      !cells.length && !isSidebarCollapsed && sidebarMode === 2;
    const isBatching = sidebarMode === 3;
    if (!isFirstDeposit && !modalIsOpen && !isBatching) {
      setSidebarMode(0);
      setIsSidebarCollapsed(true);
    }
  });

  return (
    <>
      <div className="background">
        <picture>
          <source
            media="(max-width:768px)"
            srcSet={require("./assets/videos/dynamic-bg-mb.gif")}
          />
          <img
            id="dynamicBg"
            src={require("./assets/videos/dynamic-bg.gif")}
            alt="background"
          />
        </picture>
      </div>
      {(isLoading || isDaoTransitMsgLoading) && (
        <div className="modal-loading-overlay">
          <div className="modal-loading-circle" />
          {isWaitingTxConfirm && (
            <p className="tx-confirmation-message highlight-txt">
              Your transaction can take a few minutes to process!
            </p>
          )}
        </div>
      )}

      {!ckbAddress && (
        <div className="guest--screen">
          <div className="guest--content">
            <img
              src={gradientLogo}
              alt="joyDAO"
              className="logo"
              draggable={false}
            />
            <h1
              className="title"
              onClick={async () => {
                await updateJoyDaoInfo("all");
              }}
            >
              joyDAO.cc
            </h1>
            <p className="sub-title">Multi-chain Nervos DAO portal</p>
            <Button
              className="signin-button"
              onClick={() => {
                try {
                  open();
                } catch (e: any) {
                  enqueueSnackbar("Error: " + e.message, {
                    variant: "error",
                  });
                }
              }}
            >
              Login Now
            </Button>
            <footer>
              <p>
                <span>joyDAO © 2024</span>
                <span>
                  Deposit to <span className="highlight-txt">Nervos DAO</span>{" "}
                  today!
                </span>
              </p>
            </footer>
          </div>
          <div className="guest--slider">
            <img src={bgGuestLogin01} alt="blockchain-mountain" />
          </div>
        </div>
      )}

      {ckbAddress && (
        <div className="auth--screen">
          {cells.length === 0 && isLoading == false ? (
            <div className="no-deposit-message">
              <h2 className="highlight-txt">You don't have any deposit yet</h2>
              <Button
                onClick={() => {
                  setIsSidebarCollapsed(false);
                  setSidebarMode(2);
                }}
              >
                Deposit Now
              </Button>
            </div>
          ) : (
            <TransformWrapper
              alignmentAnimation={{ animationType: "linear" }}
              zoomAnimation={{ animationType: "linear" }}
              velocityAnimation={{ animationType: "linear" }}
            >
              <TransformComponent>
                <div
                  className="cell-diagram"
                  style={{ cursor: mouseDown ? "grabbing" : "grab" }}
                >
                  {cells.map((cell, index) => {
                    // dao deposit complete shaking rythm
                    const animationDelayRandomizer = new SeededRandom(
                      parseInt(
                        ckbHash(blockchain.OutPoint.pack(cell.outPoint!)).slice(
                          -8
                        ),
                        16
                      )
                    );

                    const animationDelay = animationDelayRandomizer.next(0, 1);

                    const capacity =
                      parseInt(cell.cellOutput.capacity, 16) /
                      CKB_SHANNON_RATIO;

                    const isDeposit = depositCells.some(
                      (c) => c.outPoint?.txHash === cell.outPoint?.txHash
                    );

                    return (
                      <Cell
                        type={isDeposit ? "deposit" : "withdraw"}
                        progress={cell.currentCycleProgress}
                        value={capacity}
                        selected={pickedCells.includes(cell)}
                        onSelectCell={(e) => {
                          if (sidebarMode === 3) {
                            e.stopPropagation();
                            onSelectCell(e, cell);
                          }
                        }}
                        onCellAction={(e: any) => {
                          e.stopPropagation();
                          isDeposit ? onWithdraw(cell) : onUnlock(cell);
                        }}
                        onExploringTransaction={(e: any) => {
                          e.stopPropagation();
                          onExploringCell(cell);
                        }}
                        className={cx([sidebarMode === 3 && "selectable"])}
                        isRipe={cell.ripe}
                        animationDelay={animationDelay}
                      />
                    );
                  })}
                </div>
              </TransformComponent>
            </TransformWrapper>
          )}
          <aside
            ref={sidebarRef}
            className={cx([
              isSidebarCollapsed ? "collapsed" : "expanded",
              sidebarMode === 3 && "batching",
            ])}
          >
            <header>
              <img
                className="logo"
                src={require("./assets/icons/logo.svg").default}
                alt="joyDAO"
                draggable={false}
              />
              <p className="address">{shortenAddress(ckbAddress)}</p>
              <Button
                type="ghost"
                icon={require("./assets/icons/copy.svg").default}
                className="copy"
                onClick={(e) => {
                  e.stopPropagation();
                  copyAddress(ckbAddress);
                }}
              />
            </header>
            {accountBalances()}
            {sidebarMode === 0 && (
              <>
                <ul className="sidebar-menu">
                  {!isJoyIdAddress(ckbAddress) && (
                    <li
                      className="sidebar-item"
                      onClick={() => {
                        setIsSidebarCollapsed(false);
                        setSidebarMode(1);
                      }}
                    >
                      <img
                        src={require("./assets/icons/transfer.svg").default}
                        className="icon"
                        draggable={false}
                      />
                      <span className="text">Transfer</span>
                    </li>
                  )}
                  <li
                    className="sidebar-item"
                    onClick={() => {
                      setIsSidebarCollapsed(false);
                      setSidebarMode(2);
                    }}
                  >
                    <img
                      src={require("./assets/icons/deposit.svg").default}
                      className="icon"
                      draggable={false}
                    />
                    <span className="text">Deposit</span>
                  </li>
                  <li
                    className="sidebar-item"
                    onClick={() => {
                      setIsSidebarCollapsed(false);
                      setPickedCells([]);
                      setSidebarMode(3);
                    }}
                  >
                    <img
                      src={require("./assets/icons/batch.svg").default}
                      className="icon"
                      draggable={false}
                    />
                    <span className="text">Batch</span>
                  </li>
                  <li className="sidebar-item sign-out" onClick={onSignOut}>
                    <img
                      src={require("./assets/icons/sign-out.svg").default}
                      className="icon"
                      draggable={false}
                    />
                    <span className="text">Sign Out</span>
                  </li>
                </ul>
                <Button
                  type="ghost"
                  icon={require("./assets/icons/sidebar-control.svg").default}
                  className="sidebar-control"
                  onClick={() => {
                    const newState = !isSidebarCollapsed;
                    localStorage.setItem(
                      "isSidebarCollapse",
                      newState ? "1" : "0"
                    );
                    setIsSidebarCollapsed(newState);
                  }}
                />
              </>
            )}
            {!isJoyIdAddress(ckbAddress) && sidebarMode === 1 && transferForm()}
            {sidebarMode === 2 && depositForm()}
            {sidebarMode === 3 && batchForm()}
          </aside>
        </div>
      )}
      {daoTransitInfoModal()}
    </>
  );
};

const cccWrappedApp = () => {
  return (
    <SnackbarProvider
      className="notif"
      anchorOrigin={{ vertical: "top", horizontal: "right" }}
    >
      <ccc.Provider>
        <App />
      </ccc.Provider>
    </SnackbarProvider>
  );
};

export default cccWrappedApp;
