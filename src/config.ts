export const NODE_URL = "https://testnet.ckb.dev/";
export const INDEXER_URL = "https://testnet.ckb.dev/indexer";

// testnet joyid
export const JOYID_CELLDEP = {
  codeHash: "0xd23761b364210735c19c60561d213fb3beae2fd6172743719eff6920e020baac",
  hashType: "type",
  outPoint: {
    txHash: "0x4dcf3f3b09efac8995d6cbee87c5345e812d310094651e0c3d9a730f32dc9263",
    index: "0x0"
  },
  depType: "depGroup"
};

export const OMNILOCK_CELLDEP = {
  codeHash: "0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb",
  hashType: "type",
  outPoint: {
    txHash: "0xec18bf0d857c981c3d1f4e17999b9b90c484b303378e94de1a57b0872f5d4602",
    index: "0x0"
  },
  depType: "code"
}

export const TEST_NET_CONFIG = {
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

export const TX_FEE = 10_000; //shanon
// omnilock|joyid lock script argument is 2 bytes longer than that of secp256k1's.
// so whereas the secp256r1-dao takes 102, joyid-dao takes 104
export const DAO_MINIMUM_CAPACITY = 104;
export const MINIMUM_CHANGE_CAPACITY = 63; //63ckb for joyidLock/moniLock cell
export const CKB_SHANNON_RATIO = 100_000_000;

export const TESTNET_EXPLORER_PREFIX = "https://pudge.explorer.nervos.org/transaction/";