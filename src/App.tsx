import * as React from 'react';
import { Cell } from "@ckb-lumos/base";
import { connect, signRawTransaction } from '@joyid/ckb';
import { sendTransaction, waitForTransactionConfirmation, queryBalance } from './lib/helpers';
import { initializeConfig } from "@ckb-lumos/config-manager";
import { Config } from './types';
import { TEST_NET_CONFIG, NODE_URL, CKB_SHANNON_RATIO } from "./config";
import { buildDepositTransaction, buildWithdrawTransaction, buildUnlockTransaction, collectDeposits, collectWithdrawals } from "./joy-dao";

export default function App() {
  const [joyidInfo, setJoyidInfo] = React.useState<any>(null);
  const [balance, setBalance] = React.useState<bigint | null>(null);
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

      localStorage.setItem('balance', balance.toString());
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
      localStorage.setItem('balance', balance.toString());
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
    return `${address.slice(0, 7)}...${address.slice(-8)}`;
  }

  const handleDepositKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => { //TODO
    if (event.key === 'Enter') {
      onDeposit();
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
      setBalance(BigInt(storedBalance));
    }
    if (storedDepositCells) {
      setDepositCells(JSON.parse(storedDepositCells));
    }
    if (storedWithdrawalCells) {
      setWithdrawalCells(JSON.parse(storedWithdrawalCells));
    }
  }, []);

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px' }}
      onClick={(e) => {
        e.stopPropagation(); // Prevent event propagation
        if (isDepositing && e.target === e.currentTarget) {
          setDepositAmount('');
          setIsDepositing(false);
        }
      }}
    >
      <h1 style={{ fontSize: '2.5em', textShadow: '2px 2px 2px rgba(0, 0, 0, 0.2)', transform: 'rotate(-2deg)', marginBottom: '20px', color: '#00c891' }}>JoyDAO</h1>
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: '20px' }}>
        {joyidInfo ? (
          <div style={{ position: 'relative', marginRight: '20px' }}>
            <button style={{ backgroundColor: '#00c891', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: '5px', cursor: 'pointer' }} onClick={() => setShowDropdown(!showDropdown)}>
              {shortenAddress(joyidInfo.address)}
            </button>
            {showDropdown && (
              <div style={{ position: 'absolute', backgroundColor: '#fff', border: '1px solid #00c891', padding: '10px', borderRadius: '5px', zIndex: '1', color: '#00c891' }}>
                <p>Balance: {balance ? balance.toString() + ' CKB' : 'Loading...'}</p>
                <button style={{ backgroundColor: '#00c891', color: '#fff', padding: '5px 10px', border: 'none', borderRadius: '5px', cursor: 'pointer', marginTop: '10px' }} onClick={onSignOut}>Sign Out</button>
              </div>
            )}
          </div>
        ) : (
          <button style={{ backgroundColor: '#00c891', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: '5px', cursor: 'pointer', marginRight: '10px' }} onClick={onConnect}>Connect JoyID</button>
        )}
        {joyidInfo && (
          isDepositing ? (
            <input
              type="text"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onDeposit()}
              style={{ backgroundColor: '#00c891', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
            />
          ) : (
            <button style={{ backgroundColor: '#00c891', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: '5px', cursor: 'pointer' }} onClick={onDeposit}>Deposit</button>
          )
        )}
      </div>
      {joyidInfo && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '80%' }}>
          {depositCells.map((cell, index) => (
            <div key={index} style={{ border: '1px solid #aee129', padding: '10px', marginBottom: '10px', borderRadius: '10px', width: '50%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#aee129' }}>
              <p style={{ color: '#5c6e00' }}>
                <a href={`https://pudge.explorer.nervos.org/transaction/${cell.outPoint?.txHash}`} target="_blank" rel="noreferrer" style={{ color: '#5c6e00', textDecoration: 'none' }}>{parseInt(cell.cellOutput.capacity, 16) / CKB_SHANNON_RATIO} CKBytes</a>
              </p>
              <button style={{ backgroundColor: '#5c6e00', color: '#aee129', padding: '5px 10px', border: 'none', borderRadius: '5px', cursor: 'pointer' }} onClick={() => onWithdraw(cell)}>Withdraw</button>
            </div>
          ))}
  
          {withdrawalCells.map((cell, index) => (
            <div key={index} style={{ border: '1px solid #fe9503', padding: '10px', marginBottom: '10px', borderRadius: '10px', width: '50%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fe9503' }}>
              <p style={{ color: '#003d66' }}>
                <a href={`https://pudge.explorer.nervos.org/transaction/${cell.outPoint?.txHash}`} target="_blank" rel="noreferrer" style={{ color: '#003d66', textDecoration: 'none' }}>{parseInt(cell.cellOutput.capacity, 16) / CKB_SHANNON_RATIO} CKBytes</a>
              </p>
              <button style={{ backgroundColor: '#003d66', color: '#fe9503', padding: '5px 10px', border: 'none', borderRadius: '5px', cursor: 'pointer' }} onClick={() => onUnlock(cell)}>Unlock</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
