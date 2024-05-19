import * as React from 'react';
import { connect, signTransaction } from '@joyid/ckb';
import { sendTransaction, waitForTransactionConfirmation } from './lib/index.js';
 
export default function App() {
  const [joyidInfo, setJoyidInfo] = React.useState<any>(null);
  const [toAddress, setToAddress] = React.useState('ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqqxzpa4nv6at3r3a2ljlyskr3nnlt07yrwucr9ck6');
  const [amount, setAmount] = React.useState('100');
  const NODE_URL = "https://testnet.ckb.dev/";
 
  const onConnect = async () => {
    try {
      const authData = await connect();
      setJoyidInfo(authData);
    } catch (error) {
      console.error(error);
    }
  }
 
  const onSign = async () => {
    const signedTx = await signTransaction({
      to: toAddress,
      from: joyidInfo.address,
      amount: BigInt(Number(amount) * 10 ** 8).toString(),
    });
    console.log('signedTx', signedTx);
    
    // Send the transaction to the RPC node.
    const txid = await sendTransaction(NODE_URL, signedTx);
    console.log(`Transaction Sent: ${txid}\n`);

    // Wait for the transaction to confirm.
    await waitForTransactionConfirmation(NODE_URL, txid);
    console.log("\n");

  }
  return (
    <div>
      <h1>Hello JoyID!</h1>
      {joyidInfo ? null : <button onClick={onConnect}>Connect JoyID</button>}
      {joyidInfo ? (
        <div>
          <textarea value={toAddress} onChange={e => setToAddress(e.target.value)} />
          <textarea value={amount} onChange={e => setAmount(e.target.value)} />
          <button onClick={onSign}>Sign</button>
        </div>
      ) : null}
    </div>
  )
}