import * as React from "react";
import { initConfig, connect, signRawTransaction } from "@joyid/ckb";
import {
  sendTransaction,
  waitForTransactionConfirmation,
  queryBalance,
  Balance,
  enrichDaoCellInfo,
  DaoCell,
  getTipEpoch,
  SeededRandom,
  isJoyIdAddress,
  estimateReturn,
} from "./lib/helpers";
import { initializeConfig } from "@ckb-lumos/config-manager";
import { Config } from "./types";
import {
  TEST_NET_CONFIG,
  CKB_SHANNON_RATIO,
  EXPLORER_PREFIX,
  JOYID_URL,
  CCC_MAINNET,
} from "./config";
import {
  buildDepositTransaction,
  buildWithdrawTransaction,
  buildUnlockTransaction,
  collectDeposits,
  collectWithdrawals,
} from "./joy-dao";
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

const App = () => {
  const [balance, setBalance] = React.useState<Balance | null>(null);
  const [ckbAddress, setCkbAddress] = React.useState("");
  const [depositCells, setDepositCells] = React.useState<DaoCell[]>([]);
  const [withdrawalCells, setWithdrawalCells] = React.useState<DaoCell[]>([]);
  const depositCellsRef = React.useRef(depositCells);
  const withdrawalCellsRef = React.useRef(withdrawalCells);
  const [windowWidth, setWindowWidth] = React.useState(window.innerWidth);
  const [renderKick, setRenderKick] = React.useState<number>(0);

  const [depositAmount, setDepositAmount] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isWaitingTxConfirm, setIsWaitingTxConfirm] = React.useState(false);
  const [modalIsOpen, setModalIsOpen] = React.useState(false);
  const [currentCell, setCurrentCell] = React.useState<DaoCell | null>(null);
  const [tipEpoch, setTipEpoch] = React.useState<number>();
  const [isModalMessageLoading, setIsModalMessageLoading] =
    React.useState(false);
  const [connectModalIsOpen, setConnectModalIsOpen] = React.useState(false);
  const [compensation, setCompensation] = React.useState<number>();
  const [percentageLoading, setPercentageLoading] = React.useState<number>(0);

  const { wallet, open, disconnect, setClient } = ccc.useCcc();
  const signer = ccc.useSigner();
  const { enqueueSnackbar } = useSnackbar();

  initConfig({
    name: "joyDAO",
    logo: "https://fav.farm/🆔",
    joyidAppURL: JOYID_URL,
  });
  initializeConfig(TEST_NET_CONFIG as Config);

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

  const updateDaoList = async (daoType: "all" | "deposit" | "withdraw") => {
    const storedCkbAddress = localStorage.getItem("ckbAddress");
    if (storedCkbAddress) {
      try {
        let balance, deposits, withdrawals, epoch;
        if (daoType == "all") {
          [balance, deposits, withdrawals, epoch] = await Promise.all([
            queryBalance(storedCkbAddress),
            collectDeposits(storedCkbAddress),
            collectWithdrawals(storedCkbAddress),
            getTipEpoch(),
          ]);

          setBalance(balance);
          setDepositCells(deposits as DaoCell[]);
          setWithdrawalCells(withdrawals as DaoCell[]);
          setIsLoading(false);
          setTipEpoch(epoch);

          localStorage.setItem("balance", JSON.stringify(balance));
          localStorage.setItem("depositCells", JSON.stringify(deposits));
          localStorage.setItem("withdrawalCells", JSON.stringify(withdrawals));
        } else if (daoType == "deposit") {
          [balance, deposits, epoch] = await Promise.all([
            queryBalance(storedCkbAddress),
            collectDeposits(storedCkbAddress),
            getTipEpoch(),
          ]);

          setBalance(balance);
          setDepositCells(deposits as DaoCell[]);
          setIsLoading(false);
          setTipEpoch(epoch);

          localStorage.setItem("balance", JSON.stringify(balance));
          localStorage.setItem("depositCells", JSON.stringify(deposits));
        } else if (daoType == "withdraw") {
          [balance, withdrawals, epoch] = await Promise.all([
            queryBalance(storedCkbAddress),
            collectWithdrawals(storedCkbAddress),
            getTipEpoch(),
          ]);

          setBalance(balance);
          setWithdrawalCells(withdrawals as DaoCell[]);
          setIsLoading(false);
          setTipEpoch(epoch);

          localStorage.setItem("balance", JSON.stringify(balance));
          localStorage.setItem("withdrawalCells", JSON.stringify(withdrawals));
        }
      } catch (e: any) {
        enqueueSnackbar("Error: " + e.message, { variant: "error" });
      }
    }
  };

  const joyIdConnect = async () => {
    try {
      setConnectModalIsOpen(false);
      const authData = await connect();
      await settleUserInfo(authData.address);
    } catch (e: any) {
      enqueueSnackbar("Error: " + e.message, { variant: "error" });
    }
  };

  function cccConnect() {
    if (ckbAddress) settleUserInfo(ckbAddress);
  }

  const onConnect = async () => {
    setConnectModalIsOpen(true);
  };

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
  const onDeposit = async () => {
    if (depositAmount == "") {
      enqueueSnackbar("Please input amount!", { variant: "error" });
      return;
    } else if (!/^[0-9]+$/.test(depositAmount)) {
      enqueueSnackbar("Please input a valid numeric amount!", {
        variant: "error",
      });
      return;
    }

    try {
      const amount = BigInt(depositAmount);
      const daoTx = await buildDepositTransaction(ckbAddress, amount);
      
      let txid = "";
      if (isJoyIdAddress(ckbAddress)) {
        const signedTx = await signRawTransaction(daoTx, ckbAddress);
        txid = await sendTransaction(signedTx);
      } else {
        if (signer) {
          enqueueSnackbar(`Openning ${wallet.name} ...`, {
            variant: "success",
          });
          txid = await signer.sendTransaction(daoTx);
        } else {
          throw new Error("Wallet disconnected. Reconnect!");
        }
      }

      enqueueSnackbar(`Transaction Sent: ${txid}`, { variant: "success" });
      setIsWaitingTxConfirm(true);
      setIsLoading(true);
      await waitForTransactionConfirmation(txid);
      setIsWaitingTxConfirm(false);
      setDepositAmount("");
      await updateDaoList("deposit");
    } catch (e: any) {
      enqueueSnackbar("Error: " + e.message, { variant: "error" });
    }
  };

  const onWithdraw = async (cell: DaoCell) => {
    setModalIsOpen(true);
    setIsModalMessageLoading(true);
    setCurrentCell(cell);
    setIsModalMessageLoading(false);
  };

  const _onWithdraw = async (cell: DaoCell) => {
    try {
      const daoTx = await buildWithdrawTransaction(ckbAddress, cell);
      let txid = "";
      if (isJoyIdAddress(ckbAddress)) {
        const signedTx = await signRawTransaction(daoTx, ckbAddress);
        txid = await sendTransaction(signedTx);
      } else {
        if (signer) {
          txid = await signer.sendTransaction(daoTx);
        } else {
          throw new Error("Wallet disconnected. Reconnect!");
        }
      }

      enqueueSnackbar(`Transaction Sent: ${txid}`, { variant: "success" });
      setIsWaitingTxConfirm(true);
      setIsLoading(true);
      await waitForTransactionConfirmation(txid);
      setIsWaitingTxConfirm(false);
      await updateDaoList("all");
    } catch (e: any) {
      enqueueSnackbar("Error: " + e.message, { variant: "error" });
    }
  };

  const onUnlock = async (cell: DaoCell) => {
    setModalIsOpen(true);
    setIsModalMessageLoading(true);
    setCurrentCell(cell);
    setIsModalMessageLoading(false);
  };

  const _onUnlock = async (withdrawalCell: DaoCell) => {
    try {
      const daoTx = await buildUnlockTransaction(ckbAddress, withdrawalCell);

      let signedTx;
      let txid = "";

      if (isJoyIdAddress(ckbAddress)) {
        signedTx = await signRawTransaction(daoTx, ckbAddress);
        txid = await sendTransaction(signedTx);
      } else {
        if (signer) {
          txid = await signer.sendTransaction(daoTx);
        } else {
          throw new Error("Wallet disconnected. Reconnect!");
        }
      }

      enqueueSnackbar(`Transaction Sent: ${txid}`, { variant: "success" });
      setIsWaitingTxConfirm(true);
      setIsLoading(true);
      await waitForTransactionConfirmation(txid);
      setIsWaitingTxConfirm(false);
      await updateDaoList("withdraw");
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

  // updating deposit info
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
      return;
    }

    (async () => {
      setCkbAddress(await signer.getRecommendedAddress());
    })();
  }, [signer]);

  // calling cccConnect when ckbAddress varies
  React.useEffect(() => {
    cccConnect();
  }, [ckbAddress]);

  // cc wallet
  React.useEffect(() => {
    if (CCC_MAINNET) setClient(new ClientPublicMainnet());
    else setClient(new ClientPublicTestnet());
  }, [setClient, CCC_MAINNET]);

  // estimate return
  React.useEffect(() => {
    if (!(tipEpoch && currentCell))
      return;

    if (!currentCell.isDeposit)
      return;
    
    const fetchData = async () => {
      const totalReturn = await estimateReturn(currentCell, tipEpoch);
      const compensation = (totalReturn - parseInt(currentCell.cellOutput.capacity, 16)/CKB_SHANNON_RATIO);
      setCompensation(compensation);
    };
    fetchData();
  }, [tipEpoch, currentCell]);

  // creating a loafin effect on deposit button
  React.useEffect(() => {
    const interval = setInterval(() => {
      setPercentageLoading((prevPercentage) => {
        return prevPercentage === 100 ? 1 : prevPercentage + 1;
      });
    }, 5);

    return () => clearInterval(interval);
  }, []);

  // calculate background position for an overlay,
  // showing cycle progress bar on top of each deposit
  function calculateButtonBorderProgressBar(percentage: number) {
    let backgroundPos = '';
    const targetBtnSize = {
      width: windowWidth <= 768 ? 90 : 110,
      height: windowWidth <= 768 ? 30 : 30,
    };
    const deltaH = windowWidth <= 768 ? 1 : 2;
    const deltaW = windowWidth <= 768 ? 1 : 2;
    const totalLength = (targetBtnSize.width + targetBtnSize.height)*2;
    const borderLen = (percentage / 100) * totalLength;

    if (borderLen <= targetBtnSize.width) {
      backgroundPos = '' + (-targetBtnSize.width + borderLen) + 'px 0px, ' + (targetBtnSize.width - deltaW) + 'px -' + targetBtnSize.height + 'px, ' + targetBtnSize.width + 'px ' + (targetBtnSize.height - deltaH) + 'px, 0px ' + targetBtnSize.height + 'px';
    } else if (borderLen <= (targetBtnSize.width + targetBtnSize.height)) {
      backgroundPos = '0px 0px, ' + (targetBtnSize.width - deltaW) + 'px ' + (-targetBtnSize.height + (borderLen - targetBtnSize.width)) + 'px, ' + targetBtnSize.width + 'px ' + (targetBtnSize.height - deltaH) + 'px, 0px ' + targetBtnSize.height + 'px';
    } else if (borderLen <= (targetBtnSize.width * 2 + targetBtnSize.height)) {
      backgroundPos = '0px 0px, ' + (targetBtnSize.width - deltaW) + 'px 0px, ' + (targetBtnSize.width - (borderLen - targetBtnSize.width - targetBtnSize.height)) + 'px ' + (targetBtnSize.height - deltaH) + 'px, 0px ' + targetBtnSize.height +'px';
    } else {
      backgroundPos = '0px 0px, ' + (targetBtnSize.width - deltaW) + 'px 0px, 0px ' + (targetBtnSize.height - deltaH) + 'px, 0px ' + (targetBtnSize.height - (borderLen - (targetBtnSize.width * 2) - targetBtnSize.height)) + 'px';
    }
    return backgroundPos;
  }

  {
    const daoCellNum = [...depositCells, ...withdrawalCells].length;
    const smallScreenDeviceMinCellWidth = 100;
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
        {!ckbAddress && <div className="entrance-decor"></div>}
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
              await updateDaoList("all");
              window.location.reload();
            }}
          >
            joyDAO
          </h1>
        )}

        {ckbAddress && (
          <div className="info-board">
            <div className="text-based-info">
              • Account: {shortenAddress(ckbAddress)}
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

            <div className="text-based-info">
              • Deposit:{" "}
              <span className="underline">
                <input
                  type="text"
                  className="deposit-textbox"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  onKeyDown={handleDepositKeyDown}
                />
              </span>
            </div>
          </div>
        )}

        {!ckbAddress && (
          <div className="description">
            <p>Multi-chain Nervos DAO portal</p>
          </div>
        )}

        {!ckbAddress && (
          <button className="signin-button" onClick={onConnect}>
            Connect
          </button>
        )}

        {(!ckbAddress || !signer) && (
          <Modal
            isOpen={connectModalIsOpen}
            onRequestClose={() => {
              setConnectModalIsOpen(false);
            }}
          >
            <div className="main-wallet-option">
              <h3 className="connect-wallet">Connect Wallet</h3>
              <h3 className="headline-separation"> </h3>
              <button
                className="signin-button joyid-connect"
                onClick={() => {
                  setConnectModalIsOpen(false);
                  joyIdConnect();
                }}
              >
                JoyID Passkeys
              </button>

              <button
                className="signin-button other-wallet-connect"
                onClick={() => {
                  setConnectModalIsOpen(false);
                  try {
                    open();
                  } catch (e: any) {
                    enqueueSnackbar("Error: " + e.message, {
                      variant: "error",
                    });
                  }
                }}
              >
                Others
              </button>
            </div>
          </Modal>
        )}

        <div className="account-deposit-buttons">
          {ckbAddress &&
            (!signer && !isJoyIdAddress(ckbAddress) ? (
              <button
                className="account-button"
                onClick={() => {
                  setConnectModalIsOpen(true);
                }}
              >
                Reconnect
              </button>
            ) : (
              <button className="account-button" onClick={onSignOut}>
                Sign Out
              </button>
            ))}
          {ckbAddress && (
            <button
              className="deposit-button"
              onClick={(e) => {
                onDeposit();
              }}
            >
              Deposit
            </button>
          )}
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
                  const backgroundColor = isDeposit ? "#99c824" : "#e58603";
                  const buttonColor = "#2d4858";

                  return (
                    <div
                      key={index}
                      className={`dao-cell`}
                      ref={(el) => {
                        if (el) {
                          el.style.setProperty("--cellWidth", `${cellWidth}px`);
                          el.style.setProperty(
                            "--cellHeight",
                            `${cellHeight}px`
                          );
                          el.style.setProperty(
                            "--backgroundColor",
                            backgroundColor
                          );
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

              <Modal
                isOpen={modalIsOpen}
                onRequestClose={() => {
                  setModalIsOpen(false);
                }}
              >
                {isModalMessageLoading && (
                  <div className="modal-loading-overlay">
                    <div className="modal-loading-circle-container">
                      <div className="modal-loading-circle"></div>
                    </div>
                  </div>
                )}

                {/* <h3 className="deposit-message-head">Deposit Information</h3> */}
                <div className="deposit-circular-progress-bar">
                  <CircularProgressbarWithChildren
                    value={currentCell?.currentCycleProgress!}
                    styles={buildStyles({
                      pathColor:
                        currentCell?.currentCycleProgress! < 93
                          ? "#99c824"
                          : "#e58603",
                    })}
                  >
                    <p className="deposit-message">
                      Cycle{" "}
                      {!currentCell?.isDeposit && currentCell?.ripe
                        ? currentCell?.completedCycles!
                        : currentCell?.completedCycles! + 1} | Progress {currentCell?.currentCycleProgress!}%
                    </p>

                    {!currentCell?.isDeposit && (
                      <p className="deposit-message">
                        Compensation: {currentCell ? getCompensation(currentCell) : ' ~ CKB'}
                      </p>
                    )}

                    {!currentCell?.isDeposit &&
                      (!currentCell?.ripe ? (
                        <p className="deposit-message highlight">
                          Complete in:{" "}
                          {(currentCell?.cycleEndInterval! + 1) / 6 > 2
                            ? `${(
                                (currentCell?.cycleEndInterval! + 1) /
                                6
                              ).toFixed(2)}d`
                            : `${(currentCell?.cycleEndInterval! + 1) * 4}h`}
                        </p>
                      ) : (
                        <p className="deposit-message highlight">Complete now!</p>
                      ))}

                    {(currentCell?.isDeposit) && (
                      <p className="deposit-message">
                        Compensation: {compensation ? `${compensation?.toFixed(2)} CKB` : `${" ~ CKB"}`}
                      </p>
                    )}

                    {currentCell?.isDeposit && currentCell.ripe && (
                      <p className="deposit-message highlight">
                        New Lock Cycle in: {currentCell?.cycleEndInterval! * 4}h
                      </p>
                    )}

                    {currentCell?.isDeposit &&
                      (!currentCell.ripe ? (
                        <p className="deposit-message highlight">
                          Max Reward in:{" "}
                          {currentCell?.cycleEndInterval! >= 12 &&
                          (currentCell?.cycleEndInterval! - 12) / 6 > 2
                            ? `${(
                                (currentCell?.cycleEndInterval! - 12) /
                                6
                              ).toFixed(2)}d`
                            : `${(currentCell?.cycleEndInterval! - 12) * 4}h`}
                        </p>
                      ) : (
                        <p className="deposit-message highlight">
                          Withdraw now!
                        </p>
                      )
                    )}

                  </CircularProgressbarWithChildren>
                </div>

                <div className="button">
                  <button
                    className="proceed"
                    disabled={
                      currentCell
                        ? !currentCell.isDeposit && !currentCell.ripe
                        : false
                    }
                    onClick={() => {
                      if (currentCell) {
                        if (currentCell.isDeposit) {
                          _onWithdraw(currentCell);
                        } else {
                          _onUnlock(currentCell);
                        }
                      }
                      setModalIsOpen(false);
                    }}
                  >
                    Proceed
                  </button>

                  <button
                    className="cancel"
                    onClick={() => {
                      setModalIsOpen(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </Modal>
            </div>
          ))}
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
