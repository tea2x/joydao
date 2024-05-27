import * as React from 'react';
import { Cell } from "@ckb-lumos/base";
import { connect, signRawTransaction } from '@joyid/ckb';
import { sendTransaction, waitForTransactionConfirmation, queryBalance } from './lib/helpers';
import { initializeConfig } from "@ckb-lumos/config-manager";
import { Config } from './types';
import { TEST_NET_CONFIG, NODE_URL, CKB_SHANNON_RATIO } from "./const";
import { buildDepositTransaction, buildWithdrawTransaction, collectDeposits, collectWithdrawals } from "./joy-dao";

export default function App() {
  const [joyidInfo, setJoyidInfo] = React.useState<any>(null);
  const [balance, setBalance] = React.useState<bigint | null>(null);
  const [depositCells, setDepositCells] = React.useState<Cell[]>([]);
  const [withdrawalCells, setWithdrawalCells] = React.useState<Cell[]>([]);
  const [showDropdown, setShowDropdown] = React.useState(false);

  initializeConfig(TEST_NET_CONFIG as Config);

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
    } catch (error) {
      console.error(error);
    }
  }

  const onDeposit = async () => {
    const daoTx = await buildDepositTransaction(joyidInfo.address, BigInt(1234));
    const signedTx = await signRawTransaction(
      daoTx,
      joyidInfo.address
    );

    // Send the transaction to the RPC node.
    const txid = await sendTransaction(NODE_URL, signedTx);
    console.log(`Transaction Sent: ${txid}\n`);

    // Wait for the transaction to confirm.
    await waitForTransactionConfirmation(NODE_URL, txid);
    console.log("\n");
  }

  const onWithdraw = async (cell: Cell) => {
    const daoTx = await buildWithdrawTransaction(joyidInfo.address, cell);

    const signedTx = await signRawTransaction(
      daoTx,
      joyidInfo.address
    );

    // Send the transaction to the RPC node.
    const txid = await sendTransaction(NODE_URL, signedTx);
    console.log(`Transaction Sent: ${txid}\n`);

    // Wait for the transaction to confirm.
    await waitForTransactionConfirmation(NODE_URL, txid);
    console.log("\n");
  }

  const onSignOut = async () => {
    setJoyidInfo(null);
    setBalance(null);
    setDepositCells([]);
    setShowDropdown(false);

    localStorage.removeItem('joyidInfo');
    localStorage.removeItem('balance');
    localStorage.removeItem('depositCells');
  }

  const shortenAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 7)}...${address.slice(-8)}`;
  }

  // Check for existing authentication data in localStorage when component mounts
  React.useEffect(() => {
    const storedAuthData = localStorage.getItem('joyidInfo');
    const storedBalance = localStorage.getItem('balance');
    const storedDepositCells = localStorage.getItem('depositCells');
    if (storedAuthData) {
      setJoyidInfo(JSON.parse(storedAuthData));
    }
    if (storedBalance) {
      setBalance(BigInt(storedBalance));
    }
    if (storedDepositCells) {
      setDepositCells(JSON.parse(storedDepositCells));
    }
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px' }}>
      <h1 style={{ fontSize: '2.5em', textShadow: '2px 2px 2px rgba(0, 0, 0, 0.2)', transform: 'rotate(-2deg)', marginBottom: '20px', color: '#00c891' }}>JoyDAO</h1>
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: '20px' }}>
        {joyidInfo ? (
          <div style={{ position: 'relative' }}>
            <button style={{ backgroundColor: '#00c891', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: '5px', cursor: 'pointer', marginRight: '10px' }} onClick={() => setShowDropdown(!showDropdown)}>
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
        <button style={{ backgroundColor: '#00c891', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: '5px', cursor: 'pointer' }} onClick={onDeposit}>Deposit</button>
      </div>
      {joyidInfo && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '80%' }}>
          {depositCells.map((cell, index) => (
            <div key={index} style={{ border: '1px solid #00c891', padding: '10px', marginBottom: '10px', borderRadius: '5px', width: '60%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ color: '#00c891' }}>
                <a href={`https://pudge.explorer.nervos.org/transaction/${cell.outPoint?.txHash}`} target="_blank" rel="noreferrer" style={{ color: '#00c891', textDecoration: 'none' }}>{parseInt(cell.cellOutput.capacity, 16) / CKB_SHANNON_RATIO} CKBytes</a>
              </p>
              <button style={{ backgroundColor: '#00c891', color: '#fff', padding: '5px 10px', border: 'none', borderRadius: '5px', cursor: 'pointer' }} onClick={() => onWithdraw(cell)}>Withdraw</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
