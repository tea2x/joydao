import * as React from 'react';
import { initConfig, connect, signRawTransaction } from '@joyid/ckb';
import { sendTransaction, waitForTransactionConfirmation, 
  queryBalance, Balance, enrichDaoCellInfo, DaoCell, 
  getTipEpoch, SeededRandom, isJoyIdAddress } from './lib/helpers';
import { initializeConfig } from "@ckb-lumos/config-manager";
import { Config } from './types';
import { TEST_NET_CONFIG, CKB_SHANNON_RATIO, TESTNET_EXPLORER_PREFIX, JOYID_URL, CCC_MAINNET } from "./config";
import { buildDepositTransaction, buildWithdrawTransaction,
  buildUnlockTransaction, collectDeposits, collectWithdrawals } from "./joy-dao";
import { ccc } from "@ckb-ccc/connector-react";
import { ClientPublicTestnet, ClientPublicMainnet } from "@ckb-ccc/core";
import "./App.css";
import Modal from 'react-modal';
Modal.setAppElement('#root');
import { SnackbarProvider, useSnackbar } from 'notistack';
import 'react-circular-progressbar/dist/styles.css';
import { CircularProgressbarWithChildren, buildStyles } from 'react-circular-progressbar';

const App = () => {
  const [balance, setBalance] = React.useState<Balance | null>(null);
  const [ckbAddress, setCkbAddress] = React.useState("");
  const [depositCells, setDepositCells] = React.useState<DaoCell[]>([]);
  const [withdrawalCells, setWithdrawalCells] = React.useState<DaoCell[]>([]);
  const depositCellsRef = React.useRef(depositCells);
  const withdrawalCellsRef = React.useRef(withdrawalCells);
  const [windowWidth, setWindowWidth] = React.useState(window.innerWidth);
  const [renderKick, setRenderKick] = React.useState<number>(0);

  const [showDropdown, setShowDropdown] = React.useState(false);
  const [depositAmount, setDepositAmount] = React.useState('');
  const [isDepositing, setIsDepositing] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isWaitingTxConfirm, setIsWaitingTxConfirm] = React.useState(false);
  const [modalIsOpen, setModalIsOpen] = React.useState(false);
  const [currentCell, setCurrentCell] = React.useState<DaoCell | null>(null);
  const [tipEpoch, setTipEpoch] = React.useState<number>();
  const [isModalMessageLoading, setIsModalMessageLoading] = React.useState(false);
  const [connectModalIsOpen, setConnectModalIsOpen] = React.useState(false);

  const { wallet, open, disconnect, setClient } = ccc.useCcc();
  const signer = ccc.useSigner();
  const { enqueueSnackbar } = useSnackbar();

  initConfig({
    name: "joyDAO",
    logo: "https://fav.farm/🆔",
    joyidAppURL: JOYID_URL,
  });
  initializeConfig(TEST_NET_CONFIG as Config);

  const updateDaoList = async (daoType: "all" | "deposit" | "withdraw") => {
    const storedCkbAddress = localStorage.getItem('ckbAddress');
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
    
          localStorage.setItem('balance', JSON.stringify(balance));
          localStorage.setItem('depositCells', JSON.stringify(deposits));
          localStorage.setItem('withdrawalCells', JSON.stringify(withdrawals));
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
    
          localStorage.setItem('balance', JSON.stringify(balance));
          localStorage.setItem('depositCells', JSON.stringify(deposits));
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
    
          localStorage.setItem('balance', JSON.stringify(balance));
          localStorage.setItem('withdrawalCells', JSON.stringify(withdrawals));
        }
      } catch (e: any) {
        enqueueSnackbar('Error: ' + e.message, { variant: 'error' });
      }
    }
  };

  const joyIdConnect = async () => {
    try {
      setConnectModalIsOpen(false);
      const authData = await connect();
      await settleUserInfo(authData.address);
    } catch (e: any) {
      enqueueSnackbar('Error: ' + e.message, { variant: 'error' });
    }
  };

  function cccConnect() {
    if (ckbAddress)
      settleUserInfo(ckbAddress);
  }

  const onConnect = async () => {
    setConnectModalIsOpen(true);
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
  
      localStorage.setItem('ckbAddress', ckbAddress);
      localStorage.setItem('balance', JSON.stringify(balance));
      localStorage.setItem('depositCells', JSON.stringify(deposits));
      localStorage.setItem('withdrawalCells', JSON.stringify(withdrawals));
    } catch (e: any) {
      enqueueSnackbar('Error: ' + e.message, { variant: 'error' });
    }
  };

  const onDeposit = async () => {
    if (isDepositing) {
      try {
        setIsDepositing(false);
        const amount = BigInt(depositAmount);
        // reset state var
        setDepositAmount('');
        const daoTx = await buildDepositTransaction(ckbAddress, amount);

        let signedTx;
        let txid = "";
        if (isJoyIdAddress(ckbAddress)) {
          signedTx = await signRawTransaction(
            daoTx,
            ckbAddress
          );
          txid = await sendTransaction(signedTx);
        } else {
          if (signer) {
            enqueueSnackbar(`Openning ${wallet.name} ...`, { variant: 'success' });
            txid = await signer.sendTransaction(daoTx);
          } else {
            throw new Error('Wallet disconnected. Reconnect!');
          }
        }

        enqueueSnackbar(`Transaction Sent: ${txid}`, { variant: 'success' });
        setIsWaitingTxConfirm(true);
        setIsLoading(true);

        // Wait for the transaction to confirm.
        await waitForTransactionConfirmation(txid);

        // update deposit/withdrawal list and balance
        setIsWaitingTxConfirm(false);
        await updateDaoList("deposit");

      } catch (e:any) {
        enqueueSnackbar('Error: ' + e.message, { variant: 'error' });
      }
    } else {
      setIsDepositing(true);
    }
  }

  const onWithdraw = async (cell:DaoCell) => {
    // Open the modal 
    setModalIsOpen(true);
    setIsModalMessageLoading(true);

    // Save the cell for later
    setCurrentCell(cell);
    setIsModalMessageLoading(false);
  };
  
  const _onWithdraw = async (cell: DaoCell) => {
    try {
      const daoTx = await buildWithdrawTransaction(ckbAddress, cell);

      let signedTx;
      let txid = "";

      if (isJoyIdAddress(ckbAddress)) {
        signedTx = await signRawTransaction(
          daoTx,
          ckbAddress
        );
        // Send the transaction to the RPC node.
        txid = await sendTransaction(signedTx);
      } else {
        if (signer) {
          txid = await signer.sendTransaction(daoTx);
        } else {
          throw new Error('Wallet disconnected. Reconnect!');
        }
      }
      
      enqueueSnackbar(`Transaction Sent: ${txid}`, { variant: 'success' });

      setIsWaitingTxConfirm(true);
      setIsLoading(true);

      // Wait for the transaction to confirm.
      await waitForTransactionConfirmation(txid);

      // update deposit/withdrawal list and balance
      setIsWaitingTxConfirm(false);
      await updateDaoList("all");

    } catch(e:any) {
      enqueueSnackbar('Error: ' + e.message, { variant: 'error' });
    }
  }

  const onUnlock = async (cell:DaoCell) => {
    // Open the modal 
    setModalIsOpen(true);
    setIsModalMessageLoading(true);

    // Save the cell for later
    setCurrentCell(cell);
    setIsModalMessageLoading(false);
  };

  const _onUnlock = async(withdrawalCell: DaoCell) => {
    try {
      const daoTx = await buildUnlockTransaction(ckbAddress, withdrawalCell);

      let signedTx;
      let txid = "";

      if (isJoyIdAddress(ckbAddress)) {
        signedTx = await signRawTransaction(
          daoTx,
          ckbAddress
        );
        // Send the transaction to the RPC node.
        txid = await sendTransaction(signedTx);
      } else {
        if (signer) {
          txid = await signer.sendTransaction(daoTx);
        } else {
          throw new Error('Wallet disconnected. Reconnect!');
        }
      }

      enqueueSnackbar(`Transaction Sent: ${txid}`, { variant: 'success' });

      setIsWaitingTxConfirm(true);
      setIsLoading(true);

      // Wait for the transaction to confirm.
      await waitForTransactionConfirmation(txid);

      // update deposit/withdrawal list and balance
      setIsWaitingTxConfirm(false);
      await updateDaoList("withdraw");
      
    } catch(e:any) {
      enqueueSnackbar('Error: ' + e.message, { variant: 'error' });
    }
  }

  const onSignOut = async () => {
    disconnect();
    setCkbAddress("");
    setBalance(null);
    setDepositCells([]);
    setWithdrawalCells([]);
    setShowDropdown(false);
    setIsLoading(false);

    localStorage.removeItem('ckbAddress');
    localStorage.removeItem('balance');
    localStorage.removeItem('depositCells');
    localStorage.removeItem('withdrawalCells');
  }

  const shortenAddress = (address: string) => {
    if (!address) return '';
    if (windowWidth <= 768) {
      return `${address.slice(0, 8)}...${address.slice(-5)}`;
    } else {
      return `${address.slice(0, 8)}...${address.slice(-8)}`;
    }
  }

  const handleDepositKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => { //TODO
    if (event.key === 'Enter') {
      onDeposit();
    }
  }

  const cleanUp = (e:any) => {
    e.stopPropagation(); // Prevent event propagation
    if (isDepositing && e.target === e.currentTarget) {
      setDepositAmount('');
      setIsDepositing(false);
    }
    if (showDropdown && e.target === e.currentTarget) {
      setShowDropdown(false);
    }
  }

  const copyAddress = (address:string) => {
    if (navigator.clipboard) {
      // Clipboard API is available
      navigator.clipboard.writeText(address).then(() => {
        enqueueSnackbar('Address copied to clipboard', { variant: 'info' });
      }).catch(err => {
        enqueueSnackbar('Could not copy address', { variant: 'error' });
      });
    } else {
      // Clipboard API is not available, use fallback
      const textarea = document.createElement('textarea');
      textarea.value = address;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        enqueueSnackbar('Could not copy address', { variant: 'error' });
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };

  // enriching dao cell info
  React.useEffect(() => {
    if (depositCellsRef.current !== depositCells) {
      Promise.all(depositCells.map(async (cell) => {
        await enrichDaoCellInfo(cell as DaoCell, true, tipEpoch!);
      })).then(() => {
        depositCellsRef.current = depositCells;
        // kick re-renderring when enriching process's done
        setRenderKick((prevRenderKick) => prevRenderKick + 1);
      });
    }
  
    if (withdrawalCellsRef.current !== withdrawalCells) {
      Promise.all(withdrawalCells.map(async (cell) => {
        await enrichDaoCellInfo(cell as DaoCell, false, tipEpoch!);
      })).then(() => {
        withdrawalCellsRef.current = withdrawalCells;
        // kick re-renderring when enriching process's done
        setRenderKick((prevRenderKick) => prevRenderKick + 1);
      });
    }
  }, [depositCells, withdrawalCells, tipEpoch]);

  // updating deposit info
  React.useEffect(() => {
    const storedCkbAddress = localStorage.getItem('ckbAddress');
    const storedBalance = localStorage.getItem('balance');
    const storedDepositCells = localStorage.getItem('depositCells');
    const storedWithdrawalCells = localStorage.getItem('withdrawalCells');
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
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
    if (CCC_MAINNET)
      setClient(new ClientPublicMainnet);
    else
      setClient(new ClientPublicTestnet)
  }, [setClient, CCC_MAINNET]);

  {
    const daoCellNum = [...depositCells, ...withdrawalCells].length;
    const smallScreenDeviceMinCellWidth = 100;
    const largeScreenDeviceMinCellWidth = 120;

    // fix cell heights and minimum cell width, 
    // ensuring the smallest deposit stays in square form
    const cellHeight = windowWidth <= 768 ? 
      smallScreenDeviceMinCellWidth : 
      largeScreenDeviceMinCellWidth;

    // in case there're too few deposit, fill up dummy cells
    const fillerNum = (windowWidth <= 768) ? 12 : 20;
    const maxDummyCellWidth = 150;
    const dummyCellWidthRandomizer = new SeededRandom(daoCellNum);

    return (
      <div className="container" onClick={(e) => cleanUp(e)}>
        {!ckbAddress && (
          <div className='entrance-decor'></div>
        )}
        {isLoading && (
          <div className="loading-overlay">
            <div className="loading-circle-container">
              <div className="loading-circle"></div>
              {isWaitingTxConfirm && (
                <p className="tx-confirmation-message">
                  Your tx can take a few minutes to process!
                </p>
              )}
            </div>
          </div>
        )}

        <h1 className='title' onClick={async () => {
          await updateDaoList("all");
          window.location.reload();
        }}>
          joyDAO
        </h1>

        {!ckbAddress && (
          <div className='description'>
            <p>Multi-chain Nervos DAO portal</p>
          </div>
        )}

        {!ckbAddress && (
          <button className='signin-button' onClick={onConnect}>
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
            <div className='main-wallet-option'>
              <h3 className="connect-wallet">Connect Wallet</h3>
              <h3 className='headline-separation'> </h3>
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
                  } catch(e:any) {
                    enqueueSnackbar('Error: ' + e.message, { variant: 'error' });
                  }
                }}              
              >
                Others
              </button>
            </div>

          </Modal>
        )}

        <div className='account-deposit-buttons'
          onClick={(e) => cleanUp(e)}
        >
          {ckbAddress && (
            <div className='dropdown-area'>
              <button className='account-button'
                onClick={(e) => {
                  setShowDropdown(!showDropdown);
                  cleanUp(e)
                }}
              >
                <span className="copy-sign"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyAddress(ckbAddress)
                  }}
                >
                  ⧉
                </span>
                {shortenAddress(ckbAddress)}
              </button>

              {showDropdown && (
                <div className='dropdown-menu'>
                  <h5 className='account-info'>
                    <div>Available: {balance ? (BigInt(balance.available)/BigInt(CKB_SHANNON_RATIO)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + ' CKB' : 'Loading...'}</div>
                    <div>Deposited: {balance ? (BigInt(balance.occupied)/BigInt(CKB_SHANNON_RATIO)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + ' CKB' : 'Loading...'}</div>
                  </h5>

                  {(!signer && !isJoyIdAddress(ckbAddress)) ? (
                    <button className='dropdown-button'
                      onClick={() => {
                        setShowDropdown(false);
                        setConnectModalIsOpen(true)
                      }}
                    >
                      Reconnect
                    </button>

                  ) : (
                    <button className='dropdown-button' onClick={onSignOut}>
                      Sign Out
                    </button>
                  )}

                </div>
              )}
            </div>
          )}

          {ckbAddress && (
            isDepositing ? (
              <span>
                <input
                  type="text"
                  value={depositAmount}
                  placeholder="Enter CKB amount!"
                  onChange={(e) => {
                    if (e.target.value === 'Enter CKB amount') {
                      setDepositAmount('');
                    } else {
                      setDepositAmount(e.target.value);
                    }
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && onDeposit()}
                  className='deposit-textbox'
                />
                {/* <span className="max-deposit"
                  onClick={(e) => {
                    enqueueSnackbar('It\'s recommended to leave ^63 CKB to pay fee for future txs', { variant: 'info' });
                    setDepositAmount(balance? (BigInt(balance.available)/BigInt(CKB_SHANNON_RATIO)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : '');
                  }}
                >
                  Max
                </span> */}
              </span>
            ) : (
              <button className='deposit-button'
                onClick={(e) => {
                  onDeposit();
                  cleanUp(e);
                }}
              >
                Deposit
              </button>
            )
          )}
        </div>

        {ckbAddress && (
          (daoCellNum === 0 && isLoading == false) ? (
            <div className='no-deposit-message'
              onClick={(e) => cleanUp(e)}
            >
              <h2>Whoops, no deposits found!</h2>
            </div>
          ) : (
            <div className='cell-grid' onClick={(e) => cleanUp(e)}>
              {[...depositCells, ...withdrawalCells].sort((a, b) => {
                const aBlkNum = parseInt(a.blockNumber!, 16);
                const bBlkNum = parseInt(b.blockNumber!, 16);
                return bBlkNum - aBlkNum;
              }).map((cell, index) => {
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
                const totalCapacity = [...depositCells, ...withdrawalCells].reduce(
                  (sum, c) => sum + parseInt(c.cellOutput.capacity, 16),
                  0
                );
                
                let scaleFactor
                scaleFactor = (capacity < 100_000 * CKB_SHANNON_RATIO) ? scaleFactorSmall : scaleFactorLarge;
                const logScaledCellWidth = (Math.log(capacity + 1) / Math.log(totalCapacity + 1)) * scaleFactor;
                let cellWidth = (windowWidth <= 768) ? 
                  smallScreenDeviceMinCellWidth : 
                  Math.max(largeScreenDeviceMinCellWidth, logScaledCellWidth);
                
                const isDeposit = depositCells.some(
                  c => c.outPoint?.txHash === cell.outPoint?.txHash
                );
                const backgroundColor = isDeposit ? '#99c824' : '#e58603';
                const buttonColor = '#2d4858';
                return (
                  <div key={index} className={`dao-cell ${cell.ripe ? 'ripe' : ''}`}
                    ref={el => {
                      if (el) {
                        el.style.setProperty('--cellWidth', `${cellWidth}px`);
                        el.style.setProperty('--cellHeight', `${cellHeight}px`);
                        el.style.setProperty('--backgroundColor', backgroundColor);
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      cleanUp(e);
                      window.open(TESTNET_EXPLORER_PREFIX + `${cell.outPoint?.txHash}`, '_blank', 'noreferrer');
                    }}
                  >
                    <p className='dao-link'>
                      {(capacity / CKB_SHANNON_RATIO).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} CKB
                    </p>
                    <button className={`dao-cell-button ${(cell.currentCycleProgress === undefined) ? 'progressing' : ''}`}
                      ref={el => {
                        if (el) {
                          el.style.setProperty('--progressColor', buttonColor);
                          el.style.setProperty('--progressPercentage', `${cell.currentCycleProgress}%`);
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        cleanUp(e);
                        isDeposit ? onWithdraw(cell) : onUnlock(cell);
                      }}
                    >
                      {isDeposit ? 'Withdraw' : 'Unlock'}
                    </button>
                  </div>
                );
              })}

              {[...Array(Math.max(0, fillerNum - daoCellNum))].map((_, index) => {
                let cellWidth = (windowWidth <= 768) ? 
                  smallScreenDeviceMinCellWidth : 
                  Math.max(
                    largeScreenDeviceMinCellWidth, 
                    Math.floor(dummyCellWidthRandomizer.next(
                      largeScreenDeviceMinCellWidth, 
                      maxDummyCellWidth
                      )
                    )
                  );

                return (
                  <div 
                    key={`extra-${index}`}
                    className='dao-cell-dummy'
                    onClick={(e) => cleanUp(e)}
                    ref={el => {
                      if (el) {
                        el.style.setProperty('--cellWidth', `${cellWidth}px`);
                        el.style.setProperty('--cellHeight', `${cellHeight}px`);
                      }
                    }}
                  >
                  </div>
                );
              })}

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
            
                <h3 className='deposit-message-head'>Deposit Information</h3>
                <div className='deposit-cycle-progress-bar'>
                  <CircularProgressbarWithChildren
                    value={currentCell?.currentCycleProgress!}
                    styles={buildStyles({
                      pathColor: currentCell?.currentCycleProgress! < 93 ? '#99c824' : '#e58603',
                    })}
                  >
                    <p className='deposit-message'>
                      Cycle: {
                        (!currentCell?.isDeposit && currentCell?.ripe)
                          ?  currentCell?.completedCycles!
                          : currentCell?.completedCycles! + 1
                      }
                    </p>
                    <p className='deposit-message'>Progress: {currentCell?.currentCycleProgress!}%</p>
                    {!currentCell?.isDeposit && (
                      <p className='deposit-message'>
                        Total Return: {currentCell?.maximumWithdraw} CKB
                      </p>
                    )}

                    {!currentCell?.isDeposit && (
                      !currentCell?.ripe ? (
                        <p className='deposit-message highlight'>
                          Unlock in: {
                            ((currentCell?.cycleEndInterval! + 1) / 6) > 2 
                              ? `${((currentCell?.cycleEndInterval! + 1) / 6).toFixed(2)}d` 
                              : `${(currentCell?.cycleEndInterval! + 1) * 4}h`
                          }
                        </p>
                      ) : (
                        <p className='deposit-message highlight'>
                          Unlock now!
                        </p>
                      )
                    )}

                    {
                      (currentCell?.isDeposit && (
                        !currentCell.ripe ? (
                          <p className='deposit-message highlight'>
                            Max Reward in: {
                              ((currentCell?.cycleEndInterval! >=12) && ((currentCell?.cycleEndInterval! - 12) / 6) > 2)
                                ? `${((currentCell?.cycleEndInterval! - 12) / 6).toFixed(2)}d` 
                                : `${(currentCell?.cycleEndInterval! - 12) * 4}h`
                            }
                          </p>
                        ) : (
                          <p className='deposit-message highlight'>
                            Withdraw now!
                          </p>
                        )
                      ))
                    }

                    {(currentCell?.isDeposit && currentCell.ripe) && (
                      <p className='deposit-message highlight'>
                        New Lock Cycle in: {(currentCell?.cycleEndInterval!) * 4}h
                      </p>
                    )}

                  </CircularProgressbarWithChildren>
                </div>

                <div className='button'>
                  <button
                    className='proceed'
                    disabled={currentCell ? (!currentCell.isDeposit && !currentCell.ripe) : false}
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
                    className='cancel'
                    onClick={() => {
                      setModalIsOpen(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </Modal>

            </div>
          )
        )}
      </div>
    )
  }
}

const cccWrappedApp = () => {
  return (
    <SnackbarProvider className='notif' anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
      <ccc.Provider>
        <App />
      </ccc.Provider>
    </SnackbarProvider>
  );
};

export default cccWrappedApp;