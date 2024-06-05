import * as React from 'react';
import { Cell } from "@ckb-lumos/base";
import { connect, signRawTransaction } from '@joyid/ckb';
import { sendTransaction, waitForTransactionConfirmation, queryBalance, Balance, enrichDaoCellInfo, DaoCell } from './lib/helpers';
import { initializeConfig } from "@ckb-lumos/config-manager";
import { Config } from './types';
import { TEST_NET_CONFIG, NODE_URL, CKB_SHANNON_RATIO, TESTNET_EXPLORER_PREFIX } from "./config";
import { buildDepositTransaction, buildWithdrawTransaction, buildUnlockTransaction, collectDeposits, collectWithdrawals } from "./joy-dao";
import "./styles.css";
import Modal from 'react-modal';
const appElement = document.getElementById('root');

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
  const [currentCell, setCurrentCell] = React.useState<Cell | null>(null);
  const [withdrawClicked, setWithdrawClicked] = React.useState(false);


  initializeConfig(TEST_NET_CONFIG as Config);

  console.log(">>>currentCell: ", currentCell)
  const updateDaoList = async () => {
    const storedAuthData = localStorage.getItem('joyidInfo');
    if (storedAuthData) {
      try {
        const authInfo = JSON.parse(storedAuthData);

        const balance = await queryBalance(authInfo.address);
        const deposits = await collectDeposits(authInfo.address);
        const withdrawals = await collectWithdrawals(authInfo.address);
  
        setBalance(balance);
        setDepositCells(deposits as DaoCell[]);
        setWithdrawalCells(withdrawals as DaoCell[]);
        setIsLoading(false);
  
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

      setJoyidInfo(authData);
      setBalance(balance);
      setDepositCells(deposits as DaoCell[]);
      setWithdrawalCells(withdrawals as DaoCell[]);
      setIsLoading(false);

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
    // to differentiate with unlock Click
    setWithdrawClicked(true);
    // Open the modal and disable dao-cell hoverring effect
    document.body.classList.add('modal-open');
    setModalIsOpen(true);

    // enrich the deposit dao cell info
    await enrichDaoCellInfo(cell, true);

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
    // Open the modal and disable dao-cell hoverring effect
    document.body.classList.add('modal-open');
    setModalIsOpen(true);

    // enrich the withdrawal dao cell info
    await enrichDaoCellInfo(cell, false);

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

    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
                <div key={index} className='dao-cell'
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
        appElement={appElement || undefined}
        isOpen={modalIsOpen}
        onRequestClose={() => {
          // close the modal and reenable dao-cell hoverring effect
          setModalIsOpen(false); 
          document.body.classList.remove('modal-open');
        }}
      >
        <h2>Information</h2>
        <text>
          Under development ...
        </text>
        <div className='button'>
          <button
            className='proceed'
            onClick={() => {
              if (currentCell) {
                if (withdrawClicked) {
                  setWithdrawClicked(false);
                  _onWithdraw(currentCell);
                } else {
                  _onUnlock(currentCell);
                }
              }
              // close the modal and reenable dao-cell hoverring effect
              setModalIsOpen(false);
              document.body.classList.remove('modal-open');
            }}
          >
            Proceed
          </button>

          <button
            className='cancel'
            onClick={() => {
              setWithdrawClicked(false);
              // close the modal and reenable dao-cell hoverring effect
              setModalIsOpen(false);
              document.body.classList.remove('modal-open');
            }}
          >
            Cancel
          </button>
        </div>
      </Modal>

    </div>
  )
}
