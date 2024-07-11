export const ISMAINNET = false;

export const NODE_URL = ISMAINNET
  ? "https://mainnet.ckb.dev/"
  : "https://testnet.ckb.dev/";
export const INDEXER_URL = ISMAINNET
  ? "https://mainnet.ckb.dev/indexer"
  : "https://testnet.ckb.dev/indexer";

export const JOYID_CELLDEP = ISMAINNET
  ? {
      codeHash:
        "0xd00c84f0ec8fd441c38bc3f87a371f547190f2fcff88e642bc5bf54b9e318323",
      hashType: "type",
      outPoint: {
        txHash:
          "0xf05188e5f3a6767fc4687faf45ba5f1a6e25d3ada6129dae8722cb282f262493",
        index: "0x0",
      },
      depType: "depGroup",
    }
  : {
      codeHash:
        "0xd23761b364210735c19c60561d213fb3beae2fd6172743719eff6920e020baac",
      hashType: "type",
      outPoint: {
        txHash:
          "0x4dcf3f3b09efac8995d6cbee87c5345e812d310094651e0c3d9a730f32dc9263",
        index: "0x0",
      },
      depType: "depGroup",
    };

export const OMNILOCK_CELLDEP = ISMAINNET
  ? {
      codeHash:
        "0x9b819793a64463aed77c615d6cb226eea5487ccfc0783043a587254cda2b6f26",
      hashType: "type",
      outPoint: {
        txHash:
          "0xdfdb40f5d229536915f2d5403c66047e162e25dedd70a79ef5164356e1facdc8",
        index: "0x0",
      },
      depType: "code",
    }
  : {
      codeHash:
        "0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb",
      hashType: "type",
      outPoint: {
        txHash:
          "0xec18bf0d857c981c3d1f4e17999b9b90c484b303378e94de1a57b0872f5d4602",
        index: "0x0",
      },
      depType: "code",
    };

export const NETWORK_CONFIG = ISMAINNET
  ? {
      PREFIX: "ckb",
      SCRIPTS: {
        SECP256K1_BLAKE160: {
          CODE_HASH:
            "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
          HASH_TYPE: "type",
          TX_HASH:
            "0x71a7ba8fc96349fea0ed3a5c47992e3b4084b031a42264a018e0072e8172e46c",
          INDEX: "0x0",
          DEP_TYPE: "depGroup",
        },
        SECP256K1_BLAKE160_MULTISIG: {
          CODE_HASH:
            "0x5c5069eb0857efc65e1bca0c07df34c31663b3622fd3876c876320fc9634e2a8",
          HASH_TYPE: "type",
          TX_HASH:
            "0x71a7ba8fc96349fea0ed3a5c47992e3b4084b031a42264a018e0072e8172e46c",
          INDEX: "0x1",
          DEP_TYPE: "depGroup",
        },
        DAO: {
          CODE_HASH:
            "0x82d76d1b75fe2fd9a27dfbaa65a039221a380d76c926f378d3f81cf3e7e13f2e",
          HASH_TYPE: "type",
          TX_HASH:
            "0xe2fb199810d49a4d8beec56718ba2593b665db9d52299a0f9e6e75416d73ff5c",
          INDEX: "0x2",
          DEP_TYPE: "code",
        },
      },
    }
  : {
      PREFIX: "ckt",
      SCRIPTS: {
        SECP256K1_BLAKE160: {
          CODE_HASH:
            "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
          HASH_TYPE: "type",
          TX_HASH:
            "0xf8de3bb47d055cdf460d93a2a6e1b05f7432f9777c8c474abf4eec1d4aee5d37",
          INDEX: "0x0",
          DEP_TYPE: "depGroup",
          SHORT_ID: 0,
        },
        SECP256K1_BLAKE160_MULTISIG: {
          CODE_HASH:
            "0x5c5069eb0857efc65e1bca0c07df34c31663b3622fd3876c876320fc9634e2a8",
          HASH_TYPE: "type",
          TX_HASH:
            "0xf8de3bb47d055cdf460d93a2a6e1b05f7432f9777c8c474abf4eec1d4aee5d37",
          INDEX: "0x1",
          DEP_TYPE: "depGroup",
          SHORT_ID: 1,
        },
        DAO: {
          CODE_HASH:
            "0x82d76d1b75fe2fd9a27dfbaa65a039221a380d76c926f378d3f81cf3e7e13f2e",
          HASH_TYPE: "type",
          TX_HASH:
            "0x8f8c79eb6671709633fe6a46de93c0fedc9c1b8a6527a18d3983879542635c9f",
          INDEX: "0x2",
          DEP_TYPE: "code",
        },
      },
    };

// shannon per KB
export const FEE_RATE = ISMAINNET ? 2000 : 1500;
export const MIN_FEE_RATE = 1000;
// 104CKB for joyidLock/moniLock + DAO cell
export const DAO_MINIMUM_CAPACITY = 104;
// 63CKB for joyidLock/moniLock cell
export const MINIMUM_CHANGE_CAPACITY = 63;
export const CKB_SHANNON_RATIO = 100_000_000;

// TODO because payFeeByFeeRate doesn't fully support joyID
export const JOYID_SIGNATURE_PLACEHOLDER_DEFAULT = "0x" + "0".repeat(1000);

export const EXPLORER_PREFIX = ISMAINNET
  ? "https://explorer.nervos.org/transaction/"
  : "https://pudge.explorer.nervos.org/transaction/";

export const COTA_AGGREGATOR_URL = ISMAINNET
  ? "https://cota.nervina.dev/mainnet-aggregator"
  : "https://cota.nervina.dev/aggregator";
