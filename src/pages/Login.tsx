export {}

// import React from "react";
// import { SnackbarProvider, useSnackbar } from "notistack";
// import {
//   waitForTransactionConfirmation,
//   queryBalance,
//   Balance,
//   enrichDaoCellInfo,
//   DaoCell,
//   getTipEpoch,
//   SeededRandom,
//   isJoyIdAddress,
//   isOmnilockAddress,
//   isDefaultAddress,
//   estimateReturn,
// } from "../lib/helpers";
// import {
//   buildDepositTransaction,
//   buildWithdrawTransaction,
//   buildUnlockTransaction,
//   collectDeposits,
//   collectWithdrawals,
//   batchDaoCells,
// } from "../joy-dao";


// const Login: React.FC = () => {
//   const { enqueueSnackbar } = useSnackbar();

  
//   const updateJoyDaoInfo = async (
//     type: "all" | "deposit" | "withdraw" | "balance"
//   ) => {
//     const storedCkbAddress = localStorage.getItem("ckbAddress");
//     if (storedCkbAddress) {
//       try {
//         let balance, deposits, withdrawals;
//         if (type == "all") {
//           [balance, deposits, withdrawals] = await Promise.all([
//             queryBalance(storedCkbAddress),
//             collectDeposits(storedCkbAddress),
//             collectWithdrawals(storedCkbAddress),
//           ]);

//           setBalance(balance);
//           setDepositCells(deposits as DaoCell[]);
//           setWithdrawalCells(withdrawals as DaoCell[]);

//           localStorage.setItem("balance", JSON.stringify(balance));
//           localStorage.setItem("depositCells", JSON.stringify(deposits));
//           localStorage.setItem("withdrawalCells", JSON.stringify(withdrawals));
//         } else if (type == "deposit") {
//           [balance, deposits] = await Promise.all([
//             queryBalance(storedCkbAddress),
//             collectDeposits(storedCkbAddress),
//           ]);

//           setBalance(balance);
//           setDepositCells(deposits as DaoCell[]);

//           localStorage.setItem("balance", JSON.stringify(balance));
//           localStorage.setItem("depositCells", JSON.stringify(deposits));
//         } else if (type == "withdraw") {
//           [balance, withdrawals] = await Promise.all([
//             queryBalance(storedCkbAddress),
//             collectWithdrawals(storedCkbAddress),
//           ]);

//           setBalance(balance);
//           setWithdrawalCells(withdrawals as DaoCell[]);

//           localStorage.setItem("balance", JSON.stringify(balance));
//           localStorage.setItem("withdrawalCells", JSON.stringify(withdrawals));
//         } else {
//           // load balance
//           const balance = await queryBalance(storedCkbAddress);
//           setBalance(balance);
//           localStorage.setItem("balance", JSON.stringify(balance));
//         }
//       } catch (e: any) {
//         enqueueSnackbar("Error: " + e.message, { variant: "error" });
//       }
//     }
//   };

//   return (
//     <>
//       <h1
//         className="title"
//         onClick={async () => {
//           await updateJoyDaoInfo("all");
//           window.location.reload();
//         }}
//       >
//         joyDAO
//       </h1>
//       <div className="description">
//         <p>Multi-chain Nervos DAO portal</p>
//       </div>
//       <div className="entrance-decor"></div>
//       <button
//         className="signin-button"
//         onClick={() => {
//           try {
//             open();
//           } catch (e: any) {
//             enqueueSnackbar("Error: " + e.message, {
//               variant: "error",
//             });
//           }
//         }}
//       >
//         Connect
//       </button>
//     </>
//   );
// };
