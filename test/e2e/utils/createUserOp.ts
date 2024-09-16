/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/comma-dangle */
import { BigNumberish, BytesLike, ethers, getBytes, Signer } from "ethers";
import {
	IEntryPoint__factory,
} from "../../../typechain-types";
import { getGasEstimates } from "./getGasEstimates";
import sendUserOpAndWait from "./sendUserOpAndWait";
import {
	FactoryParams,
	getUserOpHash,
	UserOperation,
} from "./userOpUtils";

export const createUserOperation = async (
  provider: ethers.JsonRpcProvider,
  bundlerProvider: ethers.JsonRpcProvider,
  accountAddress: string,
  factoryParams: FactoryParams,
  userOpCallData: string,
  entryPointAddress: string,
  dummySignature: string,
  paymaster?: string,
  paymasterPostOpGasLimit?: BigNumberish,
  paymasterData?: BytesLike,
) => {
	const signer = await provider.getSigner() as ethers.Signer;
	const entryPoint = IEntryPoint__factory.connect(
		entryPointAddress,
		signer,
	);
	const nonce = await entryPoint.getNonce(accountAddress, "0x00");
	const nonceHex = "0x0" + nonce.toString();

	let userOp: Partial<UserOperation> = {
		sender: accountAddress,
		nonce: nonceHex,
		callData: userOpCallData,
		callGasLimit: "0x00",
		signature: dummySignature,
	};

	if (factoryParams.factory !== "0x") {
		userOp.factory = factoryParams.factory;
		userOp.factoryData = factoryParams.factoryData;
	}

  const {
    callGasLimit,
    verificationGasLimit,
    preVerificationGas,
    paymasterVerificationGasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
  } = await getGasEstimates(
    provider,
    bundlerProvider,
    userOp,
    entryPointAddress,
  );

  const unsignedUserOperation = {
    sender: accountAddress,
    nonce: nonceHex,
    factory: userOp.factory,
    factoryData: userOp.factoryData,
    callData: userOpCallData,
    callGasLimit,
    verificationGasLimit,
    preVerificationGas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    paymaster: paymaster,
    paymasterVerificationGasLimit: paymaster ? paymasterVerificationGasLimit : undefined,
    paymasterPostOpGasLimit: paymasterPostOpGasLimit,
    paymasterData: paymasterData,
    signature: dummySignature,
  } satisfies UserOperation;

	return await ethers.resolveProperties(unsignedUserOperation);
};

export const createAndSendUserOpWithEcdsaSig = async (
  provider: ethers.JsonRpcProvider,
  bundlerProvider: ethers.JsonRpcProvider,
  owner: Signer,
  accountAddress: string,
  factoryParams: FactoryParams,
  userOpCallData: string,
  entryPointAddress: string,
  dummySignature: string,
  paymaster?: string,
  paymasterPostOpGasLimit?: BigNumberish,
  paymasterData?: BytesLike,
) => {
  const unsignedUserOperation = await createUserOperation(
    provider,
    bundlerProvider,
    accountAddress,
    factoryParams,
    userOpCallData,
    entryPointAddress,
    dummySignature,
    paymaster,
    paymasterPostOpGasLimit,
    paymasterData,
  );

	const userOpHash = getUserOpHash(
		unsignedUserOperation,
		entryPointAddress,
		Number((await provider.getNetwork()).chainId)
	);

	const userOpSignature = await owner.signMessage(getBytes(userOpHash));

	const userOperation = {
		...unsignedUserOperation,
		signature: userOpSignature,
	};

	return await sendUserOpAndWait(
		userOperation,
		entryPointAddress,
		bundlerProvider
	);
};