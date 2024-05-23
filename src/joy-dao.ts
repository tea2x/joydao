import { connect, signTransaction, CKBTransaction, signRawTransaction } from '@joyid/ckb';
import { CkbTransactionRequest, Config, Transaction } from './types';
import { Input, Output, values, utils, OutPoint, CellDep, Script, Address, HexString, blockchain, QueryOptions} from "@ckb-lumos/base";
import {CellCollector} from "@ckb-lumos/ckb-indexer";
import { NODE_URL, INDEXER_URL, DAO_TYPE_SCRIPT, JOY_DAO_CELLDEPS, TX_FEE, DAO_MINIMUM_CAPACITY, MINIMUM_CHANGE_CAPACITY } from "./const";
import {addressToScript, encodeToAddress} from "@ckb-lumos/helpers";

const { ckbHash } = utils;

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
): Promise<{ inputCells: Input[], inputCapacity: bigint }> =>
{
	const query:QueryOptions = {lock: lockScript, type: "empty"};
	const cellCollector = new CellCollector(indexer, query);

	let inputCells:Input[] = [];
	let inputCapacity = BigInt(0);

	for await (const cell of cellCollector.collect())
	{
		inputCells.push({
            previousOutput: cell.outPoint!,
            since: "0x0"
        });
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
export const buildDaoRawTransaction = async(joyidAddr: Address, amount: bigint): Promise<Transaction> => {
    if (ckbytesToShannons(amount) < DAO_MINIMUM_CAPACITY) {
        throw new Error("Mimum DAO deposit is 102 ckb.");
    }
    const celldeps:CellDep[] = JOY_DAO_CELLDEPS as CellDep[];

    const requiredCapacity = ckbytesToShannons(amount + BigInt(MINIMUM_CHANGE_CAPACITY)) + BigInt(TX_FEE);
    console.log(">>>addressToScript(joyidAddr): ", addressToScript(joyidAddr))
    const collectedInputs = await collectInputs(INDEXER_URL, addressToScript(joyidAddr), requiredCapacity);
    console.log(">>>collectedInputs: ", collectedInputs);
    const changeCellCapacity = collectedInputs.inputCapacity - ckbytesToShannons(amount);

    let datas:string[] = ["0x0000000000000000"];

    // creating DAO output cell
    const outputCells:Output[] = [
        {
            capacity: amount.toString(),
            lock: addressToScript(joyidAddr),
            type: DAO_TYPE_SCRIPT as Script,
        }
    ];

    // append the change cell if there is change
    if (changeCellCapacity > 0) {
        const changeOutput:Output = {
            capacity: changeCellCapacity.toString(),
            lock: addressToScript(joyidAddr)
            // type: null
        };
        outputCells.push(changeOutput);
        datas.push("0x");
    }

    let witnesses = [];
    for (let i = 1; i < collectedInputs.inputCells.length; i++) {
        witnesses.push("0x0");
    }

    let tx:Transaction = {
        cellDeps: celldeps,
        //hash?: "",
        headerDeps: [],
        inputs: collectedInputs.inputCells,
        outputs: outputCells,
        outputsData: datas,
        version: "0x0",
        witnesses: witnesses,
    };

    const txHash = ckbHash(blockchain.RawTransaction.pack(tx));
    tx.hash = txHash;

    console.log(">>>tx: ", tx);

    return tx;
  }