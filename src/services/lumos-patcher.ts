//////////////////////////////////////////////////////////////////////////////////////////
// This is a temporary code since lumos::common-script::unlock doesn't work with joyID
//////////////////////////////////////////////////////////////////////////////////////////
import {
  CellDep,
  DepType,
  HexString,
  PackedSince,
  blockchain,
  values,
} from "@ckb-lumos/base";
import { RPC } from "@ckb-lumos/rpc";
import { BI, BIish } from "@ckb-lumos/bi";
import { getBlockHash } from "../lib/helpers";
import { dao } from "@ckb-lumos/common-scripts";
import { bytes, number } from "@ckb-lumos/codec";
import { findDepositCellWith } from "../lib/helpers";
import { getConfig } from "@ckb-lumos/config-manager";
import { Address, Cell, WitnessArgs } from "@ckb-lumos/base";
import { NODE_URL, JOYID_CELLDEP, OMNILOCK_CELLDEP } from "../config";
import { addressToScript, TransactionSkeletonType } from "@ckb-lumos/helpers";

const DAO_LOCK_PERIOD_EPOCHS_COMPATIBLE = BI.from(180);
const rpc = new RPC(NODE_URL);

/**
 * Add celldep to transaction.
 */
function _addCellDep(
  txSkeleton: TransactionSkeletonType,
  newCellDep: CellDep
): TransactionSkeletonType {
  const cellDep = txSkeleton.get("cellDeps").find((cellDep) => {
    return (
      cellDep.depType === newCellDep.depType &&
      new values.OutPointValue(cellDep.outPoint, { validate: false }).equals(
        new values.OutPointValue(newCellDep.outPoint, { validate: false })
      )
    );
  });

  if (!cellDep) {
    txSkeleton = txSkeleton.update("cellDeps", (cellDeps) => {
      return cellDeps.push({
        outPoint: newCellDep.outPoint,
        depType: newCellDep.depType,
      });
    });
  }

  return txSkeleton;
}

/**
 * unlock helper
 */
function _epochSinceCompatible({
  length,
  index,
  number,
}: {
  length: BIish;
  index: BIish;
  number: BIish;
}): BI {
  const _length = BI.from(length);
  const _index = BI.from(index);
  const _number = BI.from(number);
  return BI.from(0x20)
    .shl(56)
    .add(_length.shl(40))
    .add(_index.shl(24))
    .add(_number);
}

/**
 * unlock helper
 */
function _parseEpochCompatible(epoch: BIish): {
  length: BI;
  index: BI;
  number: BI;
} {
  const _epoch = BI.from(epoch);
  return {
    length: _epoch.shr(40).and(0xfff),
    index: _epoch.shr(24).and(0xfff),
    number: _epoch.and(0xffffff),
  };
}

/**
 * Generate DAO unlock transaction structure with zero fee added.
 * This is a modified version and a temporary replacement for
 * lumos::common-script::unlock function
 */
export const unlock = async (
  txSkeleton: TransactionSkeletonType,
  fromAddress: Address,
  daoWithdrawalCell: Cell
): Promise<TransactionSkeletonType> => {
  const config = getConfig();
  const DAO_SCRIPT = config.SCRIPTS.DAO;
  if (!DAO_SCRIPT)
    throw new Error("Provided config does not have DAO script setup!");

  // add celldeps
  const template = config.SCRIPTS.DAO!;
  const daoCellDep = {
    outPoint: {
      txHash: template.TX_HASH,
      index: template.INDEX,
    },
    depType: template.DEP_TYPE,
  };

  txSkeleton = _addCellDep(txSkeleton, daoCellDep);

  const fromScript = addressToScript(fromAddress, { config });
  if (fromScript.codeHash == JOYID_CELLDEP.codeHash) {
    txSkeleton = _addCellDep(txSkeleton, {
      outPoint: JOYID_CELLDEP.outPoint,
      depType: JOYID_CELLDEP.depType as DepType,
    });
  } else if (fromScript.codeHash == OMNILOCK_CELLDEP.codeHash) {
    txSkeleton = _addCellDep(txSkeleton, {
      outPoint: OMNILOCK_CELLDEP.outPoint,
      depType: OMNILOCK_CELLDEP.depType as DepType,
    });

    txSkeleton = _addCellDep(txSkeleton, {
      outPoint: {
        txHash: config.SCRIPTS.SECP256K1_BLAKE160!.TX_HASH,
        index: config.SCRIPTS.SECP256K1_BLAKE160!.INDEX,
      },
      depType: config.SCRIPTS.SECP256K1_BLAKE160?.DEP_TYPE as DepType,
    });
  } else {
    throw new Error("Only joyId and omnilock addresses are supported");
  }

  // find the deposit cell and
  // enrich DAO withdrawal cell data with block hash info
  const [daoDepositCell, withdrawBlkHash] = await Promise.all([
    findDepositCellWith(daoWithdrawalCell),
    getBlockHash(daoWithdrawalCell.blockNumber!),
  ]);
  daoWithdrawalCell.blockHash = withdrawBlkHash;

  // calculate since & capacity (interest)
  const [depositBlockHeader, withdrawBlockHeader] = await Promise.all([
    rpc.getHeader(daoDepositCell.blockHash!),
    rpc.getHeader(daoWithdrawalCell.blockHash!),
  ]);
  const depositEpoch = _parseEpochCompatible(depositBlockHeader!.epoch);
  const withdrawEpoch = _parseEpochCompatible(withdrawBlockHeader!.epoch);

  const withdrawFraction = withdrawEpoch.index.mul(depositEpoch.length);
  const depositFraction = depositEpoch.index.mul(withdrawEpoch.length);
  let depositedEpochs = withdrawEpoch.number.sub(depositEpoch.number);

  if (withdrawFraction.gt(depositFraction)) {
    depositedEpochs = depositedEpochs.add(1);
  }

  const lockEpochs = depositedEpochs
    .add(DAO_LOCK_PERIOD_EPOCHS_COMPATIBLE)
    .sub(1)
    .div(DAO_LOCK_PERIOD_EPOCHS_COMPATIBLE)
    .mul(DAO_LOCK_PERIOD_EPOCHS_COMPATIBLE);
  const minimalSinceEpoch = {
    number: BI.from(depositEpoch.number.add(lockEpochs)),
    index: BI.from(depositEpoch.index),
    length: BI.from(depositEpoch.length),
  };
  const minimalSince = _epochSinceCompatible(minimalSinceEpoch);
  const since: PackedSince = "0x" + minimalSince.toString(16);

  // adding dao withdrawal cell as the first input
  txSkeleton = txSkeleton.update("inputs", (i) => i.push(daoWithdrawalCell));
  if (since) {
    txSkeleton = txSkeleton.update("inputSinces", (inputSinces) => {
      return inputSinces.set(txSkeleton.get("inputs").size - 1, since);
    });
  }

  // add dao unlock header deps
  let headerDeps = txSkeleton.get("headerDeps");
  if (!headerDeps.contains(daoDepositCell.blockHash!)) {
    txSkeleton = txSkeleton.update("headerDeps", (headerDeps) => {
      return headerDeps.push(daoDepositCell.blockHash!);
    });
  }

  if (!headerDeps.contains(daoWithdrawalCell.blockHash!)) {
    txSkeleton = txSkeleton.update("headerDeps", (headerDeps) => {
      return headerDeps.push(daoWithdrawalCell.blockHash!);
    });
  }

  // add dao unlock witness
  headerDeps = txSkeleton.get("headerDeps");
  const depositHeaderDepIndex = headerDeps.indexOf(daoDepositCell.blockHash!);
  const defaultWitnessArgs: WitnessArgs = {
    inputType: bytes.hexify(number.Uint64LE.pack(depositHeaderDepIndex)),
  };
  const defaultWitness: HexString = bytes.hexify(
    blockchain.WitnessArgs.pack(defaultWitnessArgs)
  );
  txSkeleton = txSkeleton.update("witnesses", (witnesses) => {
    return witnesses.push(defaultWitness);
  });

  // adding output
  const outputCapacity: HexString =
    "0x" +
    dao
      .calculateMaximumWithdrawCompatible(
        daoWithdrawalCell,
        depositBlockHeader!.dao,
        withdrawBlockHeader!.dao
      )
      .toString(16);

  txSkeleton = txSkeleton.update("outputs", (outputs) => {
    return outputs.push({
      cellOutput: {
        capacity: outputCapacity,
        lock: addressToScript(fromAddress),
        type: undefined,
      },
      data: "0x",
      outPoint: undefined,
      blockHash: undefined,
    });
  });

  return txSkeleton;
};

export default {
  unlock,
};
