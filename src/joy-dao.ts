import { connect, signTransaction, CKBTransaction, signRawTransaction } from '@joyid/ckb';
import { CkbTransactionRequest, Config, Transaction } from './types';
import { Input, Output, values, utils, OutPoint, CellDep, Script, Address, HexString, blockchain, QueryOptions, Cell} from "@ckb-lumos/base";
import {CellCollector} from "@ckb-lumos/ckb-indexer";
import { NODE_URL, INDEXER_URL, DAO_TYPE_SCRIPT, JOY_DAO_CELLDEPS, TX_FEE, DAO_MINIMUM_CAPACITY, MINIMUM_CHANGE_CAPACITY, JOYID_CELLDEP} from "./const";
import {addressToScript, encodeToAddress, TransactionSkeleton} from "@ckb-lumos/helpers";
import { dao }  from "@ckb-lumos/common-scripts";
const { Indexer } = require("@ckb-lumos/ckb-indexer");
const { ckbHash } = utils;

const indexer = new Indexer(INDEXER_URL);

function ckbytesToShannons(ckbytes: bigint)
{
	ckbytes = BigInt(ckbytes);

	return ckbytes * BigInt(100_000_000);
}

function hexToInt(hex: string)
{
	hex = String(hex);
	if(hex.substr(0, 2) !== "0x" && hex.substr(0,3) !== "-0x")
		throw new Error(`Invalid hex value: "${hex}"`);

	const negative = (hex[0] === "-");
	const hexValue = hex.replace("-", "");
	let bigInt = BigInt(hexValue);
	if(negative) bigInt *= BigInt(-1);

	if(negative)
		console.warn("Warning: A negative value was passed to hexToInt()");

	return bigInt;
}

const collectInputs = async(
    indexer: any, 
    lockScript: Script, 
    capacityRequired: bigint
): Promise<{ inputCells: Cell[], inputCapacity: bigint }> =>
{
	const query:QueryOptions = {lock: lockScript, type: "empty"};
	const cellCollector = new CellCollector(indexer, query);

	let inputCells:Cell[] = [];
	let inputCapacity = BigInt(0);

	for await (const cell of cellCollector.collect())
	{
		inputCells.push(cell);
		inputCapacity += hexToInt(cell.cellOutput.capacity);

		if(inputCapacity >= capacityRequired)
			break;
	}

	if(inputCapacity < capacityRequired)
		throw new Error("Insufficient balance.");

	return {inputCells, inputCapacity};
}

/*
  joyIDaddr: the joyID address
  amount: the amount to depodit to the DAO in CKB
*/
export const buildDepositTransaction = async(joyidAddr: Address, amount: bigint) => {
    if (ckbytesToShannons(amount) < DAO_MINIMUM_CAPACITY) {
        throw new Error("Mimum DAO deposit is 102 ckb.");
    }

    let txSkeleton = TransactionSkeleton({ cellProvider: indexer });
    txSkeleton = await dao.deposit(
        txSkeleton,
        joyidAddr, // will gather inputs from this address.
        joyidAddr, // will generate a dao cell with lock of this address.
        BigInt(500*10**8),
    );

    // adding joyID cell deps
    txSkeleton = txSkeleton.set('cellDeps', txSkeleton.get('cellDeps').push(JOYID_CELLDEP as CellDep));

    // adding input cell
    const outputCapacity = txSkeleton.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cellOutput.capacity), BigInt(0));
    console.log(">>>outputCapacity: ", outputCapacity);

    const requiredCapacity = ckbytesToShannons(amount + BigInt(MINIMUM_CHANGE_CAPACITY)) + BigInt(TX_FEE);
    const collectedInputs = await collectInputs(INDEXER_URL, addressToScript(joyidAddr), requiredCapacity);
    console.log(">>>collectedInputs: ", collectedInputs);
    txSkeleton = txSkeleton.update("inputs", (i)=>i.concat(collectedInputs.inputCells));

    // const changeCellCapacity = collectedInputs.inputCapacity - ckbytesToShannons(amount);

    return txSkeleton;
}