import fs from "fs";
import * as React from 'react';
import { connect, signTransaction, CKBTransaction, signRawTransaction } from '@joyid/ckb';
import {addressToScript, encodeToAddress} from "@ckb-lumos/helpers";
import { sendTransaction, waitForTransactionConfirmation } from './lib/index.js';
import { initializeConfig } from "@ckb-lumos/config-manager";
import { CkbTransactionRequest, Config, CellDep, OutPoint } from './types';
import { NODE_URL, INDEXER_URL } from "./const";
import { buildDaoRawTransaction } from "./joy-dao";

console.log(
  ">>>buildDaoRawTransaction: ", 
  buildDaoRawTransaction(
      "ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqqykqna7seegr0eylf9t2xtka47mxzpxam52aclq7",
      BigInt(5000)
  )
)

// this is the configuration for CKB testnet
const CONFIG: Config = {
  PREFIX: "ckt",
  SCRIPTS: {
    SECP256K1_BLAKE160: {
      CODE_HASH: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
      HASH_TYPE: "type",
      TX_HASH: "0xf8de3bb47d055cdf460d93a2a6e1b05f7432f9777c8c474abf4eec1d4aee5d37",
      INDEX: "0x0",
      DEP_TYPE: "depGroup",
      SHORT_ID: 0
    },
    SECP256K1_BLAKE160_MULTISIG: {
      CODE_HASH: "0x5c5069eb0857efc65e1bca0c07df34c31663b3622fd3876c876320fc9634e2a8",
      HASH_TYPE: "type",
      TX_HASH: "0xf8de3bb47d055cdf460d93a2a6e1b05f7432f9777c8c474abf4eec1d4aee5d37",
      INDEX: "0x1",
      DEP_TYPE: "depGroup",
      SHORT_ID: 1
    },
    DAO: {
      CODE_HASH: "0x82d76d1b75fe2fd9a27dfbaa65a039221a380d76c926f378d3f81cf3e7e13f2e",
      HASH_TYPE: "type",
      TX_HASH: "0x8f8c79eb6671709633fe6a46de93c0fedc9c1b8a6527a18d3983879542635c9f",
      INDEX: "0x2",
      DEP_TYPE: "code"
    }
  }
};

const buildDepositTransaction = async (
  capacityProviderAddress: string,
  daoLockerAddress: string,
  amount: number
): Promise<CkbTransactionRequest> => {
  return {
    from: capacityProviderAddress,
    to: daoLockerAddress,
    amount: amount.toString(),
  };
};

export default function App() {
  const [joyidInfo, setJoyidInfo] = React.useState<any>(null);
  const [toAddress, setToAddress] = React.useState('ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqqxzpa4nv6at3r3a2ljlyskr3nnlt07yrwucr9ck6');
  const [amount, setAmount] = React.useState('100');
  initializeConfig(CONFIG);
 
  const onConnect = async () => {
    try {
      const authData = await connect();
      setJoyidInfo(authData);
    } catch (error) {
      console.error(error);
    }
  }

  const onSign = async () => {
    const capacityProviderAddress = "ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqqykqna7seegr0eylf9t2xtka47mxzpxam52aclq7";
    const daoLockerAddress = "ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqqxzpa4nv6at3r3a2ljlyskr3nnlt07yrwucr9ck6";

    const daoTx = await buildDepositTransaction(capacityProviderAddress, daoLockerAddress, 7000000000);
    console.log(">>>daoTx: ", daoTx);

    const signedTx = await signTransaction(daoTx);
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