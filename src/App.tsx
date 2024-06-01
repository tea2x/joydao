import * as React from 'react';
import { Cell } from "@ckb-lumos/base";
import { connect, signRawTransaction } from '@joyid/ckb';
import { sendTransaction, waitForTransactionConfirmation, queryBalance, Balance } from './lib/helpers';
import { initializeConfig } from "@ckb-lumos/config-manager";
import { Config } from './types';
import { TEST_NET_CONFIG, NODE_URL, CKB_SHANNON_RATIO } from "./config";
import { buildDepositTransaction, buildWithdrawTransaction, buildUnlockTransaction, collectDeposits, collectWithdrawals } from "./joy-dao";
import "./styles.css";

export default function App() {
  const [joyidInfo, setJoyidInfo] = React.useState<any>(null);
  const [balance, setBalance] = React.useState<Balance | null>(null);
  const [depositCells, setDepositCells] = React.useState<Cell[]>([]);
  const [withdrawalCells, setWithdrawalCells] = React.useState<Cell[]>([]);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [depositAmount, setDepositAmount] = React.useState('');
  const [isDepositing, setIsDepositing] = React.useState(false);

  initializeConfig(TEST_NET_CONFIG as Config);

  const updateDaoList = async () => {
    try {
      const balance = await queryBalance(joyidInfo.address);
      const deposits = await collectDeposits(joyidInfo.address);
      const withdrawals = await collectWithdrawals(joyidInfo.address);

      setBalance(balance);
      setDepositCells(deposits);
      setWithdrawalCells(withdrawals);

      localStorage.setItem('balance', JSON.stringify(balance));
      localStorage.setItem('depositCells', JSON.stringify(deposits));
      localStorage.setItem('withdrawalCells', JSON.stringify(withdrawals));
    } catch (error:any) {
      alert('Error: ' + error.message);
    }
  }
  
  const onConnect = async () => {
    try {
      const authData = await connect();
      const balance = await queryBalance(authData.address);
      const deposits = await collectDeposits(authData.address);
      const withdrawals = await collectWithdrawals(authData.address);

      setJoyidInfo(authData);
      setBalance(balance);
      setDepositCells(deposits);
      setWithdrawalCells(withdrawals);

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
        console.log(`Transaction Sent: ${txid}\n`);
  
        // Wait for the transaction to confirm.
        await waitForTransactionConfirmation(txid);

        // update deposit/withdrawal list and balance
        await updateDaoList();

      } catch (error:any) {
        alert('Error: ' + error.message);
      }
    } else {
      setIsDepositing(true);
    }
  }

  const onWithdraw = async (cell: Cell) => {
    try {
      const daoTx = await buildWithdrawTransaction(joyidInfo.address, cell);

      const signedTx = await signRawTransaction(
        daoTx,
        joyidInfo.address
      );

      // Send the transaction to the RPC node.
      const txid = await sendTransaction(signedTx);
      console.log(`Transaction Sent: ${txid}\n`);

      // Wait for the transaction to confirm.
      await waitForTransactionConfirmation(txid);

      // update deposit/withdrawal list and balance
      await updateDaoList();

    } catch(error:any) {
      alert('Error: ' + error.message);
    }
  }

  const onUnlock = async(withdrawalCell: Cell) => {
    try {
      const daoTx = await buildUnlockTransaction(joyidInfo.address, withdrawalCell);

      const signedTx = await signRawTransaction(
        daoTx,
        joyidInfo.address
      );
      console.log(">>>signedTx: ", JSON.stringify(signedTx, null, 2))

      // Send the transaction to the RPC node.
      const txid = await sendTransaction(signedTx);
      console.log(`Transaction Sent: ${txid}\n`);

      // Wait for the transaction to confirm.
      await waitForTransactionConfirmation(txid);

      // update deposit/withdrawal list and balance
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

    localStorage.removeItem('joyidInfo');
    localStorage.removeItem('balance');
    localStorage.removeItem('depositCells');
    localStorage.removeItem('withdrawalCells');
  }

  const shortenAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 10)}...${address.slice(-10)}`;
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

  // Check for existing authentication data in localStorage when component mounts
  React.useEffect(() => {
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
  }, []);

  return (
    <div className={`container ${joyidInfo ? '' : 'no-user'}`} onClick={(e) => hideDepositTextBoxAndDropDown(e)}>
      <h1 className='title' onClick={() => window.location.reload()}>
        JoyDAO
      </h1>
  
      <div className='signin-account-deposit-button-area' onClick={(e) => hideDepositTextBoxAndDropDown(e)}>
        {joyidInfo ? (
          <div className='dropdown-area'>
            <button className='account-button' onClick={() => setShowDropdown(!showDropdown)}>
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
        ) : (
          <button className='signin-button' onClick={onConnect}>
            Connect JoyID
          </button>
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
            <button className='deposit-button' onClick={onDeposit}>
              Deposit
            </button>
          )
        )}
      </div>
  
      {joyidInfo && (
        <div className='dao-cell-area' onClick={(e) => hideDepositTextBoxAndDropDown(e)}>
          {[...depositCells, ...withdrawalCells].length === 0 ? (
            <div className='no-deposit-message'>
              <h2>Whoops, no deposits found!</h2>
            </div>
          ) : (
            <div className='cell-grid'>
              {[...depositCells, ...withdrawalCells]
                .sort((a, b) => {
                  const aBlkNum = parseInt(a.blockNumber!, 16);
                  const bBlkNum = parseInt(b.blockNumber!, 16);
                  return bBlkNum - aBlkNum;
                })
                .map((cell, index) => {
                  const capacity = parseInt(cell.cellOutput.capacity, 16);
                  const totalCapacity = [...depositCells, ...withdrawalCells].reduce((sum, c) => sum + parseInt(c.cellOutput.capacity, 16), 0);
                  const cellScalingStep = 3;
                  const daoCellNum = [...depositCells, ...withdrawalCells].length;
                  const minBoxSize = 80;
                  const scaleFactorSmall = (daoCellNum >= cellScalingStep * 3) ? 100 : (daoCellNum >= cellScalingStep * 2) ? 150 : (daoCellNum >= cellScalingStep) ? 250 : 300;
                  const scaleFactorLarge = (daoCellNum >= cellScalingStep * 3) ? 150 : (daoCellNum >= cellScalingStep * 2) ? 250 : (daoCellNum >= cellScalingStep) ? 300 : 350;
                  const constant = 1; // ensures the argument of the logarithm is always > 1
                  const threshold = 100_000 * CKB_SHANNON_RATIO; // 100_000 CKB
                  let scaleFactor = (capacity < threshold) ? scaleFactorSmall : scaleFactorLarge;
                  const logScaledBoxSize = (Math.log(capacity + constant) / Math.log(totalCapacity + constant)) * scaleFactor;
                  const boxSize = Math.max(minBoxSize, logScaledBoxSize);
                  const isDeposit = depositCells.some(c => c.outPoint?.txHash === cell.outPoint?.txHash);
                  const backgroundColor = isDeposit ? '#aee129' : '#e58603';
                  const textColor = isDeposit ? '#5c6e00' : '#003d66';
                  const buttonColor = isDeposit ? '#5c6e00' : '#003d66';
                  const buttonTextColor = isDeposit ? '#aee129' : '#e58603';
                  return (
                    <div
                      key={index}
                      style={{
                        border: `1px solid ${backgroundColor}`,
                        padding: '10px',
                        margin: '10px',
                        borderRadius: '10px',
                        width: `${boxSize}px`,
                        height: `${boxSize}px`,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: backgroundColor,
                        boxShadow: '0px 0px 10px rgba(0,0,0,0.2)',
                        transform: 'perspective(1000px) rotateY(1deg)',
                        backfaceVisibility: 'hidden',
                        transition: 'transform 0.5s ease-in-out'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`https://pudge.explorer.nervos.org/transaction/${cell.outPoint?.txHash}`, '_blank', 'noreferrer');
                      }}
                    >
                      <p className='dao-link'>
                        {(capacity / CKB_SHANNON_RATIO).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} CKB
                      </p>
                      <button
                        style={{
                          backgroundColor: buttonColor,
                          color: buttonTextColor,
                          padding: '10px',
                          border: 'none',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          fontSize: '0.8em'
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
        </div>
      )}
    </div>
  )  
  
}
