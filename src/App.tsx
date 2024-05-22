import fs from "fs";
import * as React from 'react';
import { connect, signTransaction, signRawTransaction } from '@joyid/ckb';
import {addressToScript, encodeToAddress} from "@ckb-lumos/helpers";
import { sendTransaction, waitForTransactionConfirmation } from './lib/index.js';
import { Script } from '@ckb-lumos/base/lib/api';
import {initializeConfig} from "@ckb-lumos/config-manager";
interface CkbTransactionRequest {
  from: string
  to: string
  amount: string
}

type HashType = "type" | "data" | "data1" | "data2";

/** Deployed script on chain */
export interface ScriptConfig {
  CODE_HASH: string;
  HASH_TYPE: HashType;
  TX_HASH: string;
  INDEX: string;
  DEP_TYPE: "depGroup" | "code";
  /**
   * @deprecated the short address will be removed in the future
   * Short ID for creating CKB address, not all scripts have short IDs.
   */
  SHORT_ID?: number;
}

export interface ScriptConfigs {
  [field: string]: ScriptConfig | undefined;
}

export interface Config {
  PREFIX: string;
  SCRIPTS: ScriptConfigs;
}

// this is the configuration for CKB testnet
const CONFIG:Config = {
  PREFIX: "ckt",
  SCRIPTS: {
    SECP256K1_BLAKE160: {
      CODE_HASH: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
      HASH_TYPE: "type",
      TX_HASH: "0xc62836d19ac1d54e750c5265eea9a6f0229b76947242a90f02e71aaa264e31f0",
      INDEX: "0x0",
      DEP_TYPE: "depGroup",
      SHORT_ID: 0
    },
    SECP256K1_BLAKE160_MULTISIG: {
      CODE_HASH: "0x5c5069eb0857efc65e1bca0c07df34c31663b3622fd3876c876320fc9634e2a8",
      HASH_TYPE: "type",
      TX_HASH: "0xc62836d19ac1d54e750c5265eea9a6f0229b76947242a90f02e71aaa264e31f0",
      INDEX: "0x1",
      DEP_TYPE: "depGroup",
      SHORT_ID: 1
    },
    DAO: {
      CODE_HASH: "0x82d76d1b75fe2fd9a27dfbaa65a039221a380d76c926f378d3f81cf3e7e13f2e",
      HASH_TYPE: "type",
      TX_HASH: "0xde1a9a76061e0ead587bacea4a2e6dfda75e9d4a9e87df33aa333f99f86ba858",
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
  const NODE_URL = "https://testnet.ckb.dev/";
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