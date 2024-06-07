import * as React from 'react';
import { Cell } from "@ckb-lumos/base";
import { connect, signRawTransaction } from '@joyid/ckb';
import { sendTransaction, waitForTransactionConfirmation, queryBalance, Balance, enrichDaoCellInfo, DaoCell, getTipEpoch } from './lib/helpers';
import { initializeConfig } from "@ckb-lumos/config-manager";
import { Config } from './types';
import { TEST_NET_CONFIG, NODE_URL, CKB_SHANNON_RATIO, TESTNET_EXPLORER_PREFIX } from "./config";
import { buildDepositTransaction, buildWithdrawTransaction, buildUnlockTransaction, collectDeposits, collectWithdrawals } from "./joy-dao";
import "./styles.css";
import Modal from 'react-modal';
Modal.setAppElement('#root');

export default function App() {
  const [joyidInfo, setJoyidInfo] = React.useState<any>(null);
  const [balance, setBalance] = React.useState<Balance | null>(null);
  const [depositCells, setDepositCells] = React.useState<DaoCell[]>([]);
  const [withdrawalCells, setWithdrawalCells] = React.useState<DaoCell[]>([]);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [depositAmount, setDepositAmount] = React.useState('');
  const [isDepositing, setIsDepositing] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isWaitingTxConfirm, setIsWaitingTxConfirm] = React.useState(false);
  const [windowWidth, setWindowWidth] = React.useState(window.innerWidth);
  const [modalIsOpen, setModalIsOpen] = React.useState(false);
  const [currentCell, setCurrentCell] = React.useState<DaoCell | null>(null);
  const [modalMessage, setModalMessage] = React.useState<string>();
  const [tipEpoch, setTipEpoch] = React.useState<number>();

  initializeConfig(TEST_NET_CONFIG as Config);

  const updateDaoList = async () => {
    const storedAuthData = localStorage.getItem('joyidInfo');
    if (storedAuthData) {
      try {
        const authInfo = JSON.parse(storedAuthData);

        const balance = await queryBalance(authInfo.address);
        const deposits = await collectDeposits(authInfo.address);
        const withdrawals = await collectWithdrawals(authInfo.address);
        const epoch = await getTipEpoch();
  
        setBalance(balance);
        setDepositCells(deposits as DaoCell[]);
        setWithdrawalCells(withdrawals as DaoCell[]);
        setIsLoading(false);
        setTipEpoch(epoch);
  
        localStorage.setItem('balance', JSON.stringify(balance));
        localStorage.setItem('depositCells', JSON.stringify(deposits));
        localStorage.setItem('withdrawalCells', JSON.stringify(withdrawals));
      } catch (error:any) {
        alert('Error: ' + error.message);
      }
    }
  }
  
  const onConnect = async () => {
    setIsLoading(true);
    try {
      const authData = await connect();
      const balance = await queryBalance(authData.address);
      const deposits = await collectDeposits(authData.address);
      const withdrawals = await collectWithdrawals(authData.address);
      const epoch = await getTipEpoch();

      setJoyidInfo(authData);
      setBalance(balance);
      setDepositCells(deposits as DaoCell[]);
      setWithdrawalCells(withdrawals as DaoCell[]);
      setIsLoading(false);
      setTipEpoch(epoch);

      localStorage.setItem('joyidInfo', JSON.stringify(authData));
      localStorage.setItem('balance', JSON.stringify(balance));
      localStorage.setItem('depositCells', JSON.stringify(deposits));
      localStorage.setItem('withdrawalCells', JSON.stringify(withdrawals));
    } catch (error:any) {
        alert('Error: ' + error.message);
    }
  }

  const onDeposit = async () => {
    if (isDepositing) {
      try {
        setDepositAmount(''); // Clear the input field
        setIsDepositing(false); // Revert back to the deposit button //TODO

        const amount = BigInt(depositAmount);
        const daoTx = await buildDepositTransaction(joyidInfo.address, amount);
        const signedTx = await signRawTransaction(
          daoTx,
          joyidInfo.address
        );
  
        // Send the transaction to the RPC node.
        const txid = await sendTransaction(signedTx);
        alert(`Transaction Sent: ${txid}\n`);
  
        setIsWaitingTxConfirm(true);
        setIsLoading(true);

        // Wait for the transaction to confirm.
        await waitForTransactionConfirmation(txid);

        // update deposit/withdrawal list and balance
        setIsWaitingTxConfirm(false);
        await updateDaoList();

      } catch (error:any) {
        alert('Error: ' + error.message);
      }
    } else {
      setIsDepositing(true);
    }
  }

  const onWithdraw = async (cell:DaoCell) => {
    // Open the modal 
    setModalIsOpen(true);

    // enrich the deposit dao cell info
    await enrichDaoCellInfo(cell, true, tipEpoch!);

    // Save the cell for later
    setCurrentCell(cell);
  };
  
  const _onWithdraw = async (cell: Cell) => {
    try {
      const daoTx = await buildWithdrawTransaction(joyidInfo.address, cell);

      const signedTx = await signRawTransaction(
        daoTx,
        joyidInfo.address
      );

      // Send the transaction to the RPC node.
      const txid = await sendTransaction(signedTx);
      alert(`Transaction Sent: ${txid}\n`);

      setIsWaitingTxConfirm(true);
      setIsLoading(true);

      // Wait for the transaction to confirm.
      await waitForTransactionConfirmation(txid);

      // update deposit/withdrawal list and balance
      setIsWaitingTxConfirm(false);
      await updateDaoList();

    } catch(error:any) {
      alert('Error: ' + error.message);
    }
  }

  const onUnlock = async (cell:DaoCell) => {
    // Open the modal 
    setModalIsOpen(true);

    // enrich the withdrawal dao cell info
    await enrichDaoCellInfo(cell, false, tipEpoch!);

    // Save the cell for later
    setCurrentCell(cell);
  };

  const _onUnlock = async(withdrawalCell: Cell) => {
    try {
      const daoTx = await buildUnlockTransaction(joyidInfo.address, withdrawalCell);

      const signedTx = await signRawTransaction(
        daoTx,
        joyidInfo.address
      );
      // console.log(">>>signedTx: ", JSON.stringify(signedTx, null, 2))

      // Send the transaction to the RPC node.
      const txid = await sendTransaction(signedTx);
      alert(`Transaction Sent: ${txid}\n`);

      setIsWaitingTxConfirm(true);
      setIsLoading(true);

      // Wait for the transaction to confirm.
      await waitForTransactionConfirmation(txid);

      // update deposit/withdrawal list and balance
      setIsWaitingTxConfirm(false);
      await updateDaoList();
      
    } catch(error:any) {
      alert('Error: ' + error.message);
    }
  }

  const onSignOut = async () => {
    setJoyidInfo(null);
    setBalance(null);
    setDepositCells([]);
    setWithdrawalCells([]);
    setShowDropdown(false);
    setIsLoading(false);

    localStorage.removeItem('joyidInfo');
    localStorage.removeItem('balance');
    localStorage.removeItem('depositCells');
    localStorage.removeItem('withdrawalCells');
  }

  const shortenAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 5)}...${address.slice(-7)}`;
  }

  const handleDepositKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => { //TODO
    if (event.key === 'Enter') {
      onDeposit();
    }
  }

  const prepareMessage = () => {
    if (currentCell && tipEpoch) {
      const step = tipEpoch - currentCell.depositEpoch;
      let message = '';
      if (currentCell.isDeposit) {
        if (currentCell.ripe) {
          message = `Optimal withdrawal window reached! Withdraw now and unlock a total of ${Math.floor(step/180)} \
            complete cycles in after ${(180 - (step%180))} epochs (approximately ${(180 - (step%180))*4} hours. \
            Otherwise, your deposit will enter another 30-day lock cycle.`;
        } else {
          message = `Please wait until epoch ${(tipEpoch + 168 - step%180)} (in approximately \
            ${((168 - step%180)/6).toFixed(2)} days) to maximize your rewards in this cycle. Do you wish to continue?`
        }
      } else {
        if (currentCell.ripe) {
          message = `You're now able to complete your Dao withdrawal, receiving a total of ${currentCell.maximumWithdraw} CKB.`;
        } else {
          message = `Come back and unlock your withdrawal at epoch ${(tipEpoch + 181 - step%180)} \
            (in approximately ${((181 - step%180)/6).toFixed(2)} days).`;
        }
      }
      // display the message in modal
      setModalMessage(message);
    }
  };  

  const hideDepositTextBoxAndDropDown = (e:any) => {
    e.stopPropagation(); // Prevent event propagation
    if (isDepositing && e.target === e.currentTarget) {
      setDepositAmount('');
      setIsDepositing(false);
    }
    if (showDropdown && e.target === e.currentTarget) {
      setShowDropdown(false);
    }
  }

  React.useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);

    const storedAuthData = localStorage.getItem('joyidInfo');
    const storedBalance = localStorage.getItem('balance');
    const storedDepositCells = localStorage.getItem('depositCells');
    const storedWithdrawalCells = localStorage.getItem('withdrawalCells');
    if (storedAuthData) {
      setJoyidInfo(JSON.parse(storedAuthData));
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

    (async () => {
      await updateDaoList();
    })();  

    if (currentCell && tipEpoch) {
      prepareMessage();
    }
    return () => window.removeEventListener('resize', handleResize);
  }, [currentCell, tipEpoch]);

  return (
    <div className={`container ${joyidInfo ? '' : 'background-image'}`} onClick={(e) => hideDepositTextBoxAndDropDown(e)}>
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-circle-container">
            <div className="loading-circle"></div>
            {isWaitingTxConfirm && (
              <p className="tx-confirmation-message">
                Your tx can take up a few minutes to process!
              </p>
            )}
          </div>
        </div>
      )}

      <h1 className='title' onClick={async () => {
        await updateDaoList();
        window.location.reload();
      }}>
        JoyDAO
      </h1>

      {!joyidInfo && (
        <div className='description'>
          <p>Nervos DAO with JoyID Passkeys</p>
        </div>
      )}

      {!joyidInfo && (
        <button className='signin-button' onClick={onConnect}>
          Connect
        </button>
      )}

      <div className='account-deposit-buttons' onClick={(e) => hideDepositTextBoxAndDropDown(e)}>
        {joyidInfo && (
          <div className='dropdown-area'>
            <button className='account-button' onClick={(e) => {setShowDropdown(!showDropdown); hideDepositTextBoxAndDropDown(e)}}>
              {shortenAddress(joyidInfo.address)}
            </button>

            {showDropdown && (
              <div className='dropdown-menu'>
                <p>Available: {balance ? balance.available.toString() + ' CKB' : 'Loading...'}</p>
                <p>Deposited: {balance ? balance.occupied.toString() + ' CKB' : 'Loading...'}</p>
                <button className='signout-button' onClick={onSignOut}>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        )}

        {joyidInfo && (
          isDepositing ? (
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
          ) : (
            <button className='deposit-button' onClick={(e) => { onDeposit(); hideDepositTextBoxAndDropDown(e); }}>
              Deposit
            </button>
          )
        )}
      </div>

      {joyidInfo && [...depositCells, ...withdrawalCells].length === 0 ? (
        <div className='no-deposit-message' onClick={(e) => hideDepositTextBoxAndDropDown(e)}>
          <h2>Whoops, no deposits found!</h2>
        </div>
      ) : (
        <div className='cell-grid' onClick={(e) => hideDepositTextBoxAndDropDown(e)}>
          {[...depositCells, ...withdrawalCells].sort((a, b) => {
              const aBlkNum = parseInt(a.blockNumber!, 16);
              const bBlkNum = parseInt(b.blockNumber!, 16);
              return bBlkNum - aBlkNum;
            }).map((cell, index) => {
              const scalingStep = 3;
              const daoCellNum = [...depositCells, ...withdrawalCells].length;
              const minBoxSize = windowWidth <= 768 ? 80 : 100;

              let scaleFactorSmall;
              if (daoCellNum >= scalingStep * 3) {
                  scaleFactorSmall = 100;
              } else if (daoCellNum >= scalingStep * 2) {
                  scaleFactorSmall = 200;
              } else if (daoCellNum >= scalingStep) {
                  scaleFactorSmall = 300;
              } else {
                  scaleFactorSmall = 400;
              }

              let scaleFactorLarge;
              if (daoCellNum >= scalingStep * 3) {
                  scaleFactorLarge = 300;
              } else if (daoCellNum >= scalingStep * 2) {
                  scaleFactorLarge = 400;
              } else if (daoCellNum >= scalingStep) {
                  scaleFactorLarge = 500;
              } else {
                  scaleFactorLarge = 600;
              }
              
              const capacity = parseInt(cell.cellOutput.capacity, 16);
              const totalCapacity = [...depositCells, ...withdrawalCells].reduce(
                (sum, c) => sum + parseInt(c.cellOutput.capacity, 16),
                0
              );
              let scaleFactor
              if (capacity < 100_000 * CKB_SHANNON_RATIO) {
                scaleFactor = scaleFactorSmall
              } else {
                scaleFactor = scaleFactorLarge;
              }

              scaleFactor = windowWidth <= 768 ? scaleFactor*0.8 : scaleFactor;

              const logScaledBoxSize = (Math.log(capacity + 1) / Math.log(totalCapacity + 1)) * scaleFactor;

              let boxSize = Math.max(minBoxSize, logScaledBoxSize);
              
              const isDeposit = depositCells.some(
                c => c.outPoint?.txHash === cell.outPoint?.txHash
              );
              
              const backgroundColor = isDeposit ? '#99c824' : '#e58603';
              const buttonColor = isDeposit ? '#5c6e00' : '#003d66';
              const buttonTextColor = isDeposit ? '#99c824' : '#e58603';
              return (
                <div key={index} className='dao-cell' //{`dao-cell ${currentCell && currentCell.ripe ? 'shake' : ''}`}
                  ref={el => {
                    if (el) {
                      el.style.setProperty('--boxSize', `${boxSize}px`);
                      el.style.setProperty('--backgroundColor', backgroundColor);
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(TESTNET_EXPLORER_PREFIX + `${cell.outPoint?.txHash}`, '_blank', 'noreferrer');
                  }}
                >
                  <p className='dao-link'>
                    {(capacity / CKB_SHANNON_RATIO).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} CKB
                  </p>
                  <button className='dao-cell-button'
                    ref={el => {
                      if (el) {
                        el.style.setProperty('--buttonColor', buttonColor);
                        el.style.setProperty('--buttonTextColor', buttonTextColor);
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      isDeposit ? onWithdraw(cell) : onUnlock(cell);
                    }}
                  >
                    {isDeposit ? 'Withdraw' : 'Unlock'}
                  </button>
                </div>
              );
            })}
        </div>
      )}

      <Modal
        isOpen={modalIsOpen}
        onRequestClose={() => {
          // close the modal
          setModalIsOpen(false); 
          // clear the modal message
          setModalMessage("");
        }}
      >
        <h2>Information</h2>
        <p>{modalMessage}</p>
        <div className='button'>
          <button
            className='proceed'
            onClick={() => {
              if (currentCell) {
                // if this is a deposit cell, allow for withdraw 
                // otherwise it's a withdrawl cell and allow for unlock check
                if (currentCell.isDeposit) {
                  _onWithdraw(currentCell);
                } else {
                  _onUnlock(currentCell);
                }
              }
              // close the modal
              setModalIsOpen(false);
              // clear the modal message
              setModalMessage("");
            }}
          >
            Proceed
          </button>

          <button
            className='cancel'
            onClick={() => {
              // close the modal
              setModalIsOpen(false);
              // clear the modal message
              setModalMessage("");
            }}
          >
            Cancel
          </button>
        </div>
      </Modal>

    </div>
  )
}
