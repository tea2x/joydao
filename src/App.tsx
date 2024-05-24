import fs from "fs";
import * as React from 'react';
import { connect, signTransaction, CKBTransaction, signRawTransaction } from '@joyid/ckb';
import {addressToScript, encodeToAddress, TransactionSkeleton} from "@ckb-lumos/helpers";
import { sendTransaction, waitForTransactionConfirmation } from './lib/index.js';
import { initializeConfig } from "@ckb-lumos/config-manager";
import { CkbTransactionRequest, Config, CellDep, OutPoint } from './types';
import { TEST_NET_CONFIG, NODE_URL, INDEXER_URL, JOYID_CELLDEP } from "./const";
import { buildDepositTransaction} from "./joy-dao";

export default function App() {
  const [joyidInfo, setJoyidInfo] = React.useState<any>(null);
  const [toAddress, setToAddress] = React.useState('ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqqxzpa4nv6at3r3a2ljlyskr3nnlt07yrwucr9ck6');
  const [amount, setAmount] = React.useState('100');
  initializeConfig(TEST_NET_CONFIG as Config);

  const testJoyIdAddress = "ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqqykqna7seegr0eylf9t2xtka47mxzpxam52aclq7";
  const daoTx = buildDepositTransaction(testJoyIdAddress, BigInt(500)).then(result => {
    console.log(">>>daoTx: ", result);
    let jsonString = JSON.stringify(result, null, 2);
    console.log(">>>daoTx jsonString: ", jsonString)
  })
  .catch(error => {
      console.error("Error:", error);
  });

  const onConnect = async () => {
    try {
      const authData = await connect();
      setJoyidInfo(authData);
    } catch (error) {
      console.error(error);
    }
  }

  const onSign = async () => {
    const joyIdAddress = "ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqqykqna7seegr0eylf9t2xtka47mxzpxam52aclq7";
    // const daoLockerAddress = "ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqqxzpa4nv6at3r3a2ljlyskr3nnlt07yrwucr9ck6";

    const daoTx:CkbTransactionRequest = {
      from: "",
      to: "",
      amount: "0x0"
    };
    const signedTx = await signTransaction(daoTx);
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