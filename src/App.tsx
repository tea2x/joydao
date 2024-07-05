import * as React from "react";
import { CKBTransaction } from "@joyid/ckb";
import {
  waitForTransactionConfirmation,
  queryBalance,
  Balance,
  enrichDaoCellInfo,
  DaoCell,
  getTipEpoch,
  SeededRandom,
  isJoyIdAddress,
  isOmnilockAddress,
  isDefaultAddress,
  estimateReturn,
} from "./lib/helpers";
import { initializeConfig } from "@ckb-lumos/config-manager";
import { Config } from "./types";
import {
  NETWORK_CONFIG,
  CKB_SHANNON_RATIO,
  EXPLORER_PREFIX,
  ISMAINNET,
  DAO_MINIMUM_CAPACITY,
} from "./config";
import {
  buildDepositTransaction,
  buildWithdrawTransaction,
  buildUnlockTransaction,
  collectDeposits,
  collectWithdrawals,
} from "./joy-dao";
import { buildTransfer } from "./basic-wallet";
import { ccc } from "@ckb-ccc/connector-react";
import { ClientPublicTestnet, ClientPublicMainnet } from "@ckb-ccc/core";
import "./App.css";
import Modal from "react-modal";
Modal.setAppElement("#root");
import { SnackbarProvider, useSnackbar } from "notistack";
import "react-circular-progressbar/dist/styles.css";
import {
  CircularProgressbarWithChildren,
  buildStyles,
} from "react-circular-progressbar";
import { TransitionGroup, CSSTransition } from 'react-transition-group';

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
  const [isTestnet] = React.useState(true);
  const [pickedCells, setPickedCells] = React.useState<DaoCell[]>([]);

  const [depositAmount, setDepositAmount] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isWaitingTxConfirm, setIsWaitingTxConfirm] = React.useState(false);
  const [modalIsOpen, setModalIsOpen] = React.useState(false);
  const [pickedDaoCell, setPickedDaoCell] = React.useState<DaoCell | null>(null);
  const [currentTx, setCurrentTx] = React.useState<{tx: CKBTransaction | null, fee: number}>({tx: null, fee: 0});
  const [daoMode, setDaoMode] = React.useState<DaoFunction | null>(DaoFunction.none);
  const [tipEpoch, setTipEpoch] = React.useState<number | null>(null);
  const [isDaoTransitMsgLoading, setIsDaoTransitMsgLoading] =
    React.useState(false);
  const [compensation, setCompensation] = React.useState<number | null>(null);
  const [percentageLoading, setPercentageLoading] = React.useState<number>(0);
  const [isNextPage, setIsNextPage] = React.useState(true);

  // basic wallet
  const [transferTo, setTransferTo] = React.useState<string>("");
  const [transferAmount, setTransferAmount] = React.useState<string>("");

  const { wallet, open, disconnect, setClient } = ccc.useCcc();
  const signer = ccc.useSigner();
  const { enqueueSnackbar } = useSnackbar();

  initializeConfig(NETWORK_CONFIG as Config);

  const onNext = () => setIsNextPage(true);
  const onPrevious = () => setIsNextPage(false);

  const sumDeposit = () => {
    const sum = [...depositCells].reduce(
      (sum, c) => sum + parseInt(c.cellOutput.capacity, 16),
      0
    );
    return sum;
  };

  const sumLocked = () => {
    const sum = [...withdrawalCells].reduce(
      (sum, c) => sum + parseInt(c.cellOutput.capacity, 16),
      0
    );
    return sum;
  };

  const getCompensation = (cell:DaoCell):string => {
    if (!cell.maximumWithdraw)
      return ' ~ CKB';

    const compensation = parseInt(cell?.maximumWithdraw) - parseInt(cell?.cellOutput.capacity,16);
    return (compensation/CKB_SHANNON_RATIO).toFixed(2).toString() + " CKB";
  }

  const updateJoyDaoInfo = async (type: "all" | "deposit" | "withdraw" | "balance") => {
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

  function cccConnect() {
    if (ckbAddress) settleUserInfo(ckbAddress);
  }


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
        (isJoyIdAddress(transferTo) || isOmnilockAddress(transferTo))
        && parseInt(transferAmount) < 63
      ) {
        enqueueSnackbar("Your receiver address requires a minimum amount of 63CKB", {
          variant: "error",
        });
        return;
      } else if (isDefaultAddress(transferTo) && parseInt(transferAmount) < 61) {
        enqueueSnackbar("Your receiver address requires a minimum amount of 61CKB", {
          variant: "error",
        });
        return;
      }

      if (!signer)
        throw new Error("Wallet disconnected. Reconnect!");

      const transferTx = await buildTransfer(signer!, transferTo, transferAmount);
      const txid = await signer.sendTransaction(transferTx);

      enqueueSnackbar(`Transaction Sent: ${txid}`, { variant: "success" });
      setIsWaitingTxConfirm(true);
      setIsLoading(true);
      await waitForTransactionConfirmation(txid);
      setIsWaitingTxConfirm(false);
      await updateJoyDaoInfo("balance");
      setIsLoading(false);
    } catch (e: any) {
      enqueueSnackbar("Error: " + e.message, { variant: "error" });
    }
  }

  const preBuildDeposit = async () => {
    let daoTx: { tx: CKBTransaction | null; fee: number } =
      await buildDepositTransaction(signer, BigInt(depositAmount));

    // might be over-cautious, but worth checking with utxo
    // TODO remove when fully support fee-rate configuration
    if (daoTx!.fee > 1*CKB_SHANNON_RATIO)
      throw new Error("Paying too much transaction fee");

    setCurrentTx(daoTx!);
  }

  const preBuildWithdraw = async (depositCell:DaoCell) => {
    let daoTx:{tx: CKBTransaction | null, fee: number} =
      await buildWithdrawTransaction(signer, depositCell);

    // might be over-cautious, but worth checking with utxo
    // TODO remove when fully support fee-rate configuration
    if (daoTx!.fee > 1*CKB_SHANNON_RATIO)
      throw new Error("Paying too much transaction fee");

    setCurrentTx(daoTx!);
  }

  const preBuildUnlock = async (withdrawalCell:DaoCell) => {
    let daoTx:{tx: CKBTransaction | null, fee: number} =
      await buildUnlockTransaction(signer, withdrawalCell);

    // might be over-cautious, but worth checking with utxo
    // TODO remove when fully support fee-rate configuration
    if (daoTx!.fee > 1*CKB_SHANNON_RATIO)
      throw new Error("Paying too much transaction fee");

    setCurrentTx(daoTx!);
  }

  const onDeposit = async () => {
    try {
      if (!signer)
        throw new Error("Wallet disconnected. Reconnect!");

      if (!balance || balance.available === '0')
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

      if (parseInt(depositAmount)*CKB_SHANNON_RATIO > parseInt(balance.available))
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
  }
  
  const _onDeposit = async () => {
    try {
      if (!currentTx.tx)
        throw new Error("Transaction building has failed");

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

  const onWithdraw = async (cell: DaoCell) => {
    try {
      if (!signer)
        throw new Error("Wallet disconnected. Reconnect!");

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

  const _onWithdraw = async () => {
    try {
      if (!currentTx.tx)
        throw new Error("Transaction building has failed");

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

  const onUnlock = async (cell: DaoCell) => {
    try {
      if (!signer)
        throw new Error("Wallet disconnected. Reconnect!");

      setDaoMode(DaoFunction.unlocking);
      setModalIsOpen(true);
      setIsDaoTransitMsgLoading(true);
      if (cell.ripe)
        await preBuildUnlock(cell);
      setPickedDaoCell(cell);
      setIsDaoTransitMsgLoading(false);
    } catch (e: any) {
      enqueueSnackbar("Error: " + e.message, { variant: "error" });
    }
  };

  const _onUnlock = async () => {
    try {
      if (!currentTx.tx)
        throw new Error("Transaction building has failed");

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

  const shortenAddress = (address: string) => {
    if (!address) return "";
    if (windowWidth <= 768) {
      return `${address.slice(0, 7)}...${address.slice(-10)}`;
    } else {
      return `${address.slice(0, 7)}...${address.slice(-10)}`;
    }
  };

  const handleDepositKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onDeposit();
    }
  };

  const copyAddress = (address: string) => {
    if (navigator.clipboard) {
      // Clipboard API is available
      navigator.clipboard
        .writeText(address)
        .then(() => {
          enqueueSnackbar("Address copied to clipboard", { variant: "info" });
        })
        .catch((err) => {
          enqueueSnackbar("Could not copy address", { variant: "error" });
        });
    } else {
      // Clipboard API is not available, use fallback
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

  // enriching dao cell info
  React.useEffect(() => {
    if (!tipEpoch || !depositCells || !withdrawalCells)
      return;
    
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
    } catch(e:any) {
      if (e.message.includes("Network request failed")) {
        enqueueSnackbar("joyDAO is chasing down your data. Refresh and give it another go!", { variant: "info" });
      } else {
        enqueueSnackbar("Error: " + e.message, { variant: "error" });
      }
    }
  }, [depositCells, withdrawalCells, tipEpoch]);

  // when page refreshed, fetch from localstorage
  // only joyidinfo saved, other wallets signers get wiped out
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

  // check device window width
  React.useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });

  // updating other chain wallets info
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

  // calling cccConnect when ckbAddress varies
  React.useEffect(() => {
    cccConnect();
  }, [ckbAddress]);

  // cc wallet
  React.useEffect(() => {
    if (ISMAINNET) setClient(new ClientPublicMainnet());
    else setClient(new ClientPublicTestnet());
  }, [setClient, ISMAINNET]);

  // estimate return
  React.useEffect(() => {
    if (!tipEpoch || !pickedDaoCell)
      return;

    if (!pickedDaoCell.isDeposit)
      return;
    
    const fetchData = async () => {
      const totalReturn = await estimateReturn(pickedDaoCell, tipEpoch);
      const compensation = (totalReturn - parseInt(pickedDaoCell.cellOutput.capacity, 16)/CKB_SHANNON_RATIO);
      setCompensation(compensation);
    };
    fetchData();
  }, [tipEpoch, pickedDaoCell]);

  // creating a loading effect on deposit button
  React.useEffect(() => {
    if (!signer) {
      return;
    }

    if (!tipEpoch || (!depositCells && !withdrawalCells)) {
      return;
    }

    if ((depositCellsRef.current == depositCells)
      || (withdrawalCellsRef.current == withdrawalCells)
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

  // calculate background position for an overlay,
  // showing cycle progress bar on top of each deposit
  function calculateButtonBorderProgressBar(percentage: number) {
    let backgroundPos = "";
    const targetBtnSize = {
      width: windowWidth <= 768 ? 90 : 110,
      height: windowWidth <= 768 ? 30 : 30,
    };
    const deltaH = windowWidth <= 768 ? 1.5 : 2;
    const deltaW = windowWidth <= 768 ? 1.5 : 2;
    const totalLength = (targetBtnSize.width + targetBtnSize.height) * 2;
    const borderLen = (percentage / 100) * totalLength;

    if (borderLen <= targetBtnSize.width) {
      backgroundPos =
        "" +
        (-targetBtnSize.width + borderLen) +
        "px 0px, " +
        (targetBtnSize.width - deltaW) +
        "px -" +
        targetBtnSize.height +
        "px, " +
        targetBtnSize.width +
        "px " +
        (targetBtnSize.height - deltaH) +
        "px, 0px " +
        targetBtnSize.height +
        "px";
    } else if (borderLen <= targetBtnSize.width + targetBtnSize.height) {
      backgroundPos =
        "0px 0px, " +
        (targetBtnSize.width - deltaW) +
        "px " +
        (-targetBtnSize.height + (borderLen - targetBtnSize.width)) +
        "px, " +
        targetBtnSize.width +
        "px " +
        (targetBtnSize.height - deltaH) +
        "px, 0px " +
        targetBtnSize.height +
        "px";
    } else if (borderLen <= targetBtnSize.width * 2 + targetBtnSize.height) {
      backgroundPos =
        "0px 0px, " +
        (targetBtnSize.width - deltaW) +
        "px 0px, " +
        (targetBtnSize.width -
          (borderLen - targetBtnSize.width - targetBtnSize.height)) +
        "px " +
        (targetBtnSize.height - deltaH) +
        "px, 0px " +
        targetBtnSize.height +
        "px";
    } else {
      backgroundPos =
        "0px 0px, " +
        (targetBtnSize.width - deltaW) +
        "px 0px, 0px " +
        (targetBtnSize.height - deltaH) +
        "px, 0px " +
        (targetBtnSize.height -
          (borderLen - targetBtnSize.width * 2 - targetBtnSize.height)) +
        "px";
    }
    return backgroundPos;
  }

  function daoInfoBoard() {
    return (
      <div className="info-board">
        <div className="control-panel-headline">
          Account: {shortenAddress(ckbAddress)}
          <span
            className="copy-sign"
            onClick={(e) => {
              e.stopPropagation();
              copyAddress(ckbAddress);
            }}
          >
            ⧉
          </span>
        </div>
        <h3 className="headline-separation"> </h3>

        <div className="text-based-info">
          • Free:{" "}
          {balance
            ? (BigInt(balance.available) / BigInt(CKB_SHANNON_RATIO))
                .toString()
                .replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " CKB"
            : "Loading..."}
        </div>

        <div className="text-based-info">
          • Deposited:{" "}
          {balance
            ? (sumDeposit() / CKB_SHANNON_RATIO)
                .toString()
                .replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " CKB"
            : "Loading..."}
        </div>

        <div className="text-based-info">
          • Withdrawing:{" "}
          {balance
            ? (sumLocked() / CKB_SHANNON_RATIO)
                .toString()
                .toString()
                .replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " CKB"
            : "Loading..."}
        </div>

        <input
          type="text"
          className="control-panel-text-box"
          value={depositAmount}
          onChange={(e) => setDepositAmount(e.target.value)}
          onKeyDown={handleDepositKeyDown}
          placeholder="Enter amount to deposit!"
        />
      </div>
    );
  }

  function basicWallet() {
    return (
      <div className="info-board">
        <div className="control-panel-headline">
          Transfer
        </div>
        <h3 className="headline-separation"> </h3>

        <div className="text-based-info">
          • Transferable:{" "}
          {balance
            ? (BigInt(balance.available) / BigInt(CKB_SHANNON_RATIO))
                .toString()
                .replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " CKB"
            : "Loading..."}
        </div>

        <input
          className="control-panel-text-box"
          type="text"
          value={transferTo}
          onInput={(e) => setTransferTo(e.currentTarget.value)}
          placeholder="Enter address to transfer to!"
        />

        <input
          className="control-panel-text-box"
          type="text"
          value={transferAmount}
          onInput={(e) => setTransferAmount(e.currentTarget.value)}
          placeholder="Enter amount to transfer!"
        />
      </div>
    );
  }

  function tabNavigator() {
    return (
      <div>
        {isNextPage ? (
          <svg
            className="to-right-sign"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            id="angle-right"
            width="30"
            height="30"
            onClick={onPrevious}
          >
            <path 
              fill="#524540" 
              d="M14.83,11.29,10.59,7.05a1,1,0,0,0-1.42,0,1,1,0,0,0,0,1.41L12.71,12,9.17,15.54a1,1,0,0,0,0,1.41,1,1,0,0,0,.71.29,1,1,0,0,0,.71-.29l4.24-4.24A1,1,0,0,0,14.83,11.29Z"
            ></path>
          </svg>
        ) : (
          <svg
            className="to-left-sign"
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 24 24"
            id="angle-left"
            width="30"
            height="30"
            onClick={onNext}
          >
            <path 
              fill="#524540" 
              d="M11.29,12l3.54-3.54a1,1,0,0,0,0-1.41,1,1,0,0,0-1.42,0L9.17,11.29a1,1,0,0,0,0,1.42L13.41,17a1,1,0,0,0,.71.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41Z"
            ></path>
          </svg>
        )}
      </div>
    );
  }

  function daoDepositCircularProgressBarInfo() {
    return(
      <div className="deposit-circular-progress-bar">
        <CircularProgressbarWithChildren
          value={pickedDaoCell?.currentCycleProgress!}
          styles={buildStyles({
            pathColor:
              pickedDaoCell?.currentCycleProgress! < 93
                ? "#99c824"
                : "#e58603",
          })}
        >
          <p className="dao-transition-message">
            Cycle{" "}
            {pickedDaoCell ? (!pickedDaoCell?.isDeposit && pickedDaoCell?.ripe
                ? pickedDaoCell?.completedCycles!
                : pickedDaoCell?.completedCycles! + 1)
              : "~"}{" "}
            | Progress: {pickedDaoCell ? pickedDaoCell.currentCycleProgress! + "%" : "~"}
          </p>

          {!pickedDaoCell?.isDeposit && (
            <p className="dao-transition-message">
              Compensation: {pickedDaoCell ? getCompensation(pickedDaoCell) : "~"}
            </p>
          )}

          {!pickedDaoCell?.isDeposit &&
            (!pickedDaoCell?.ripe ? (
              <p className="dao-transition-message highlight">
                Complete in:{" "}
                {pickedDaoCell ? 
                  ((pickedDaoCell?.cycleEndInterval! + 1) / 6 > 2
                    ? `${(
                        (pickedDaoCell?.cycleEndInterval! + 1) /
                        6
                      ).toFixed(2)}d`
                    : `${(pickedDaoCell?.cycleEndInterval! + 1) * 4}h`)
                  : "~"}
              </p>
            ) : (
              <p className="dao-transition-message highlight">Complete now!</p>
            ))}

          {(pickedDaoCell?.isDeposit) && (
            <p className="dao-transition-message">
              Compensation: {(compensation != null) ? `${compensation?.toFixed(2)} CKB` : "~"}
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
            )
          )}

          {!(!pickedDaoCell?.isDeposit && !pickedDaoCell?.ripe) && (
            <p className="dao-transition-message">
              Tx fee: {currentTx.fee ? `${(currentTx.fee / CKB_SHANNON_RATIO).toFixed(8)} CKB` : `${" ~ CKB"}`}
            </p>
          )}

        </CircularProgressbarWithChildren>
      </div>
    );
  }

  function depositTransitionMessage() {
    return(
      <div>
        <p className="dao-transition-message headline">Depositing {depositAmount} CKB</p>
        <h3 className="headline-separation"> </h3>
        <p className="dao-transition-message deposit">
          • Withdrawals can be initiated any time later on but each withdrawal is only completed at the end of its 30-day cycle
        </p>
        {/* <p className="dao-transition-message deposit"> • Each withdrawal is only completed at the end of its 30-day cycle</p> */}
        {/* <p className="dao-transition-message-sample-image"></p> */}
        <p className="dao-transition-message deposit">
          • Tx fee: {currentTx.fee ? `${(currentTx.fee / CKB_SHANNON_RATIO).toFixed(8)} CKB` : `${" ~ CKB"}`}
        </p>
      </div>
    );
  }

  function daoTransitInfoModal() {
    return (
      <Modal
        isOpen={modalIsOpen}
        onRequestClose={() => {
          setModalIsOpen(false);
          setPickedDaoCell(null);
        }}
      >
        {isDaoTransitMsgLoading && (
          <div className="modal-loading-overlay">
            <div className="modal-loading-circle"></div>
          </div>
        )}

        {daoMode == DaoFunction.depositing ? (
          depositTransitionMessage()
        ) : (
          daoDepositCircularProgressBarInfo()
        )}

        <div className="button">
          <button
            className="proceed"
            disabled={
              (daoMode == DaoFunction.unlocking && pickedDaoCell)
                ? !pickedDaoCell.isDeposit && !pickedDaoCell.ripe
                : false
            }
            onClick={() => {
              if (daoMode == DaoFunction.withdrawing) {
                _onWithdraw();
              } else if (daoMode == DaoFunction.unlocking) {
                _onUnlock();
              } else if (daoMode == DaoFunction.depositing) {
                _onDeposit();
              } else {
                //nothing
              }
              setModalIsOpen(false);
              setDaoMode(DaoFunction.none);
            }}
          >
            Proceed
          </button>

          <button
            className="cancel"
            onClick={() => {
              setModalIsOpen(false);
              setPickedDaoCell(null);
            }}
          >
            Cancel
          </button>
        </div>
      </Modal>
    );
  }

  {
    const daoCellNum = [...depositCells, ...withdrawalCells].length;
    const smallScreenDeviceMinCellWidth = 110;
    const largeScreenDeviceMinCellWidth = 120;

    // fix cell heights and minimum cell width,
    // ensuring the smallest deposit stays in square form
    const cellHeight =
      windowWidth <= 768
        ? smallScreenDeviceMinCellWidth
        : largeScreenDeviceMinCellWidth;

    // in case there're too few deposit, fill up dummy cells
    const fillerNum = windowWidth <= 768 ? 12 : 20;
    const maxDummyCellWidth = 150;
    const dummyCellWidthRandomizer = new SeededRandom(daoCellNum);

    return (
      <>
        {isLoading && (
          <div className={isWaitingTxConfirm ? "loading-overlay" : "signin-loading-overlay"}>
            <div className="loading-circle-container">
              <div className="loading-circle"></div>
              {isWaitingTxConfirm && (
                <p className="tx-confirmation-message">
                  Your transaction can take a few minutes to process!
                </p>
              )}
            </div>
          </div>
        )}

        {!ckbAddress && (
          <h1
            className="title"
            onClick={async () => {
              await updateJoyDaoInfo("all");
              window.location.reload();
            }}
          >
            joyDAO
          </h1>
        )}

        {!ckbAddress && (
          <div className="description">
            <p>Multi-chain Nervos DAO portal</p>
          </div>
        )}

        {!ckbAddress && <div className="entrance-decor"></div>}

        {ckbAddress && (isJoyIdAddress(ckbAddress)? (
          daoInfoBoard()
        ) : (
          <div>
            <TransitionGroup>
              <CSSTransition
                classNames={isNextPage ? 'right-to-left' : 'left-to-right'}
                timeout={1000}
              >
                <div
                  style={{
                    marginBottom: '-30px',
                  }}
                >
                  {isNextPage ? (
                    daoInfoBoard()
                  ) : (
                    basicWallet()
                  )}
                  {tabNavigator()}
                </div>
              </CSSTransition>
            </TransitionGroup>
          </div>
        ))}

        {!ckbAddress && (
          <button
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
            Connect
          </button>
        )}

        <div className="main-buttons">
          {ckbAddress && (
            <button className="sign-out-button" onClick={onSignOut}>
              Sign Out
            </button>
          )}
          {ckbAddress && (isNextPage ? (
            <button
              className="deposit-and-transfer-button"
              onClick={(e) => {
                onDeposit();
              }}
            >
              Deposit
            </button>
          ) : (
            <button
              className="deposit-and-transfer-button"
              onClick={(e) => {
                onTransfer();
              }}
            >
              Transfer
          </button>
          ))}
        </div>

        {ckbAddress &&
          (daoCellNum === 0 && isLoading == false ? (
            <div className="no-deposit-message">
              <h2>Whoops, no deposits found!</h2>
            </div>
          ) : (
            <div className="cell-grid">
              {[
                ...depositCells.sort(
                  (a, b) =>
                    parseInt(b.blockNumber!, 16) - parseInt(a.blockNumber!, 16)
                ),
                ...withdrawalCells.sort(
                  (a, b) =>
                    parseInt(b.blockNumber!, 16) - parseInt(a.blockNumber!, 16)
                ),
              ].map((cell, index) => {
                  const scalingStep = 3;

                  let scaleFactorSmall;
                  if (daoCellNum >= scalingStep * 3) {
                    scaleFactorSmall = 150;
                  } else if (daoCellNum >= scalingStep * 2) {
                    scaleFactorSmall = 200;
                  } else if (daoCellNum >= scalingStep) {
                    scaleFactorSmall = 250;
                  } else {
                    scaleFactorSmall = 300;
                  }

                  let scaleFactorLarge;
                  if (daoCellNum >= scalingStep * 3) {
                    scaleFactorLarge = 200;
                  } else if (daoCellNum >= scalingStep * 2) {
                    scaleFactorLarge = 250;
                  } else if (daoCellNum >= scalingStep) {
                    scaleFactorLarge = 300;
                  } else {
                    scaleFactorLarge = 350;
                  }

                  const capacity = parseInt(cell.cellOutput.capacity, 16);
                  const totalCapacity = [
                    ...depositCells,
                    ...withdrawalCells,
                  ].reduce(
                    (sum, c) => sum + parseInt(c.cellOutput.capacity, 16),
                    0
                  );

                  let scaleFactor;
                  scaleFactor =
                    capacity < 100_000 * CKB_SHANNON_RATIO
                      ? scaleFactorSmall
                      : scaleFactorLarge;
                  const logScaledCellWidth =
                    (Math.log(capacity + 1) / Math.log(totalCapacity + 1)) *
                    scaleFactor;
                  let cellWidth =
                    windowWidth <= 768
                      ? smallScreenDeviceMinCellWidth
                      : Math.max(
                          largeScreenDeviceMinCellWidth,
                          logScaledCellWidth
                        );

                  const isDeposit = depositCells.some(
                    (c) => c.outPoint?.txHash === cell.outPoint?.txHash
                  );
                  const backgroundColor = isDeposit ? "#ade129" : "#e58603";
                  const buttonColor = "#2d4858";

                  return (
                    <div
                      key={index}
                      className="dao-cell"
                      ref={(el) => {
                        if (el) {
                          el.style.setProperty("--cellWidth", `${cellWidth}px`);
                          el.style.setProperty("--cellHeight", `${cellHeight}px`);
                          el.style.setProperty("--backgroundColor", backgroundColor);
                          if (pickedCells.includes(cell))
                            el.style.setProperty("--opacityCtrl", "1");
                          else
                            el.style.setProperty("--opacityCtrl", "0");
                        }
                      }}
                      onClick={(e) => {
                        window.open(
                          EXPLORER_PREFIX + `${cell.outPoint?.txHash}`,
                          "_blank",
                          "noreferrer"
                        );
                      }}
                    >
                      <p className="dao-link">
                        {(capacity / CKB_SHANNON_RATIO)
                          .toFixed(0)
                          .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}{" "}
                        CKB
                      </p>
                      <button
                        className={`dao-cell-button ${cell.ripe ? "ripe" : ''}`}
                        ref={(el) => {
                          if (el) {
                            el.style.setProperty(
                              "--buttonColor",
                              buttonColor
                            );

                            el.style.setProperty(
                              "--textColor",
                              backgroundColor
                            );

                            el.style.setProperty(
                              "--progressPercentage",
                              `${cell.currentCycleProgress}%`
                            );
                          }
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          isDeposit ? onWithdraw(cell) : onUnlock(cell);
                        }}
                      >
                        {isDeposit ?  "Withdraw" : (cell.ripe ? "Complete" : "Processing ...")}
                      </button>

                      {/*placing a layer of progress bar over each deposit button*/}
                      {cell.currentCycleProgress ? (cell.currentCycleProgress > 0 && (
                        <div
                          className={`button-border-progress-bar ${cell.ripe ? "ripe" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            isDeposit ? onWithdraw(cell) : onUnlock(cell);
                          }}
                          ref={(el) => {
                            if (el) {
                              el.style.setProperty(
                                "--backgroundPos",
                                calculateButtonBorderProgressBar(cell.currentCycleProgress)
                              );
                            }
                          }}
                        >
                          {/* hello */}
                        </div>
                      )) : ((cell.currentCycleProgress === undefined) && (
                        <div
                          className="button-border-progress-bar"
                          onClick={(e) => {
                            e.stopPropagation();
                            isDeposit ? onWithdraw(cell) : onUnlock(cell);
                          }}
                          ref={(el) => {
                            if (el) {
                              el.style.setProperty(
                                "--backgroundPos",
                                calculateButtonBorderProgressBar(percentageLoading!)
                              );
                            }
                          }}
                        >
                          {/* hello */}
                        </div>
                      ))}
                      
                      <span
                        className="check-point"
                        ref={(el) => {
                          if (el) {
                            if (pickedCells.includes(cell))
                              el.style.setProperty("--opacityCtrl", "1");
                            else
                              el.style.setProperty("--opacityCtrl", "0");
                          }
                        }}

                        onClick={(e) => {
                          e.stopPropagation();
                          try {
                            if (isLoading)
                              throw new Error("joyDAO is loading stuffs for you");

                            if (!pickedCells.includes(cell)) {

                              if (!cell.isDeposit && !cell.ripe)
                                throw new Error("Can not batch incomplete withdrawals");

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
                            enqueueSnackbar("Error: " + e.message, { variant: "error" });
                          }

                        }}
                      >
                        ✓
                      </span>

                    </div>
                  );
                })
              }

              {[...Array(Math.max(0, fillerNum - daoCellNum))].map(
                (_, index) => {
                  let cellWidth =
                    windowWidth <= 768
                      ? smallScreenDeviceMinCellWidth
                      : Math.max(
                          largeScreenDeviceMinCellWidth,
                          Math.floor(
                            dummyCellWidthRandomizer.next(
                              largeScreenDeviceMinCellWidth,
                              maxDummyCellWidth
                            )
                          )
                        );

                  return (
                    <div
                      key={`extra-${index}`}
                      className="dao-cell-dummy"
                      ref={(el) => {
                        if (el) {
                          el.style.setProperty("--cellWidth", `${cellWidth}px`);
                          el.style.setProperty(
                            "--cellHeight",
                            `${cellHeight}px`
                          );
                        }
                      }}
                    ></div>
                  );
                }
              )}
            </div>
          ))}
        {daoTransitInfoModal()}
      </>
    );
  }
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
