import { expect } from "chai";
import { ethers } from "hardhat";
import {
  EmailAccount__factory,
  EmailAccountDummyVerifier__factory,
} from "../../typechain-types";
import { setupTests } from "./utils/setupTests";
import { createUserOperation } from "./utils/createUserOp";
import { packUserOp, getUserOpHash } from "./utils/userOpUtils";
import { getSigners } from "./utils/getSigners";
import sendUserOpAndWait from "./utils/sendUserOpAndWait";
import { mockProver } from "./utils/emailAccount";

describe("EmailAccountTest", () => {
  it("should load the mock prover", async () => {
    const input = {
      userOpHashIn: "0x0",
      emailCommitmentIn: "0x1",
      pubkeyHashIn: "0x2",
    };

    const { proof, publicSignals, solidityCalldata } = await mockProver(input);

    const factory = await ethers.getContractFactory(
      "EmailAccountDummyVerifier"
    );
    const verifier = await factory.deploy();

    const result = await verifier.verifyProof(
      solidityCalldata[0],
      solidityCalldata[1],
      solidityCalldata[2],
      publicSignals
    );

    expect(result).to.be.true;
    expect(proof).to.exist;
    expect(publicSignals).to.exist;
    expect(publicSignals).to.deep.equal(Object.values(input));
  });

  it("should execute a simple ETH transfer", async () => {
    console.log("Starting EmailAccountTest...");
    const { bundlerProvider, provider, admin, entryPointAddress, deployer } =
      await setupTests();
    console.log("Test setup completed.");

    const [owner, recipient] = getSigners();
    const recipientAddress = await recipient.getAddress();
    const ownerAddress = await owner.getAddress();
    console.log("Recipient address:", recipientAddress);
    console.log("Owner address:", ownerAddress);

    // Deploy MockGroth16Verifier
    console.log("Deploying MockGroth16Verifier...");
    const mockVerifier = await deployer.connectOrDeploy(
      EmailAccountDummyVerifier__factory,
      []
    );
    const mockVerifierAddress = await mockVerifier.getAddress();
    console.log("MockGroth16Verifier deployed at:", mockVerifierAddress);

    // Sample values for DKIM public key hash and account commitment
    let SAMPLE_DKIM_PUBKEY_HASH = ethers.keccak256(
      ethers.toUtf8Bytes("sample_dkim_pubkey")
    );
    let SAMPLE_ACCOUNT_COMMITMENT = ethers.keccak256(
      ethers.toUtf8Bytes("sample_account_commitment")
    );
    console.log("DKIM public key hash:", SAMPLE_DKIM_PUBKEY_HASH);
    console.log("Account commitment:", SAMPLE_ACCOUNT_COMMITMENT);

    // Deploy EmailAccount
    console.log("Deploying EmailAccount...");
    const emailAccount = await deployer.connectOrDeploy(EmailAccount__factory, [
      entryPointAddress,
      mockVerifierAddress,
      SAMPLE_DKIM_PUBKEY_HASH,
      SAMPLE_ACCOUNT_COMMITMENT,
    ]);
    const emailAccountAddress = await emailAccount.getAddress();
    console.log("EmailAccount deployed at:", emailAccountAddress);

    // Fund the EmailAccount
    console.log("Funding EmailAccount...");
    await admin.sendTransaction({
      to: emailAccountAddress,
      value: ethers.parseEther("20"),
    });
    console.log("EmailAccount funded with 20 ETH");

    const transferAmount = ethers.parseEther("1");
    console.log("Transfer amount:", ethers.formatEther(transferAmount), "ETH");

    // Prepare calldata for a simple ETH transfer
    const callData = emailAccount.interface.encodeFunctionData("execute", [
      recipientAddress,
      transferAmount,
      "0x",
    ]);
    console.log("Calldata prepared:", callData);

    // Sample proof data (replace with actual proof data in a real scenario)
    const dummyInput = {
      userOpHashIn: "0x0",
      emailCommitmentIn: "0x1",
      pubkeyHashIn: "0x2",
    };

    const {
      proof: _,
      publicSignals: dummyPublicSignals,
      solidityCalldata: dummySolidityCalldata,
    } = await mockProver(dummyInput);
    const dummySignature = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256[2]", "uint256[2][2]", "uint256[2]", "uint256[3]"],
      [
        dummySolidityCalldata[0],
        dummySolidityCalldata[1],
        dummySolidityCalldata[2],
        dummyPublicSignals,
      ]
    );
    const unsignedUserOperation = await createUserOperation(
      provider,
      bundlerProvider,
      emailAccountAddress,
      { factory: "0x", factoryData: "0x" },
      callData,
      entryPointAddress,
      dummySignature // Temporary placeholder for signature
    );

    // Calculate userOpHash
    const chainId = await provider
      .getNetwork()
      .then((network) => network.chainId);
    let userOpHash = (getUserOpHash(
      unsignedUserOperation,
      entryPointAddress,
      Number(chainId)
    ));
   
    let p = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");

    // userOpHash = (BigInt(userOpHash)% p).toString(16);
    // SAMPLE_ACCOUNT_COMMITMENT = (BigInt(SAMPLE_ACCOUNT_COMMITMENT)% p).toString(16);
    // SAMPLE_DKIM_PUBKEY_HASH = (BigInt(SAMPLE_DKIM_PUBKEY_HASH)% p).toString(16);
    
    console.log("UserOpHash:", (BigInt(userOpHash) % p).toString(16));
    console.log("accountCommitment", (BigInt(SAMPLE_ACCOUNT_COMMITMENT) % p).toString(16));
    console.log("dkimPubkeyHash", (BigInt(SAMPLE_DKIM_PUBKEY_HASH) % p).toString(16));

    const publicInputs = {
      userOpHashIn: userOpHash,
      emailCommitmentIn: SAMPLE_ACCOUNT_COMMITMENT,
      pubkeyHashIn: SAMPLE_DKIM_PUBKEY_HASH,
    };

    const { proof, publicSignals, solidityCalldata } = await mockProver(publicInputs);

    console.log("calldata", solidityCalldata[3]);

    // ABI encode the proof and public inputs
    const signature = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256[2]", "uint256[2][2]", "uint256[2]", "uint256[3]"],
      [
        solidityCalldata[0],
        solidityCalldata[1],
        solidityCalldata[2],
        solidityCalldata[3],
      ]
    );

    // Update the userOperation with the calculated signature
    unsignedUserOperation.signature = signature;

    

    const recipientBalanceBefore = await provider.getBalance(recipientAddress);
    console.log(
      "Recipient balance before:",
      ethers.formatEther(recipientBalanceBefore),
      "ETH"
    );

    console.log(
      "Unsigned UserOperation:",
      JSON.stringify(unsignedUserOperation, null, 2)
    );

    // Send userOp
    console.log("Sending UserOperation...");

    const receipt = await sendUserOpAndWait(
      unsignedUserOperation,
      entryPointAddress,
      bundlerProvider,
      
    );
    console.log("UserOperation sent. Transaction hash:", receipt.success);

    const recipientBalanceAfter = await provider.getBalance(recipientAddress);
    console.log(
      "Recipient balance after:",
      ethers.formatEther(recipientBalanceAfter),
      "ETH"
    );

    const expectedRecipientBalance = recipientBalanceBefore + transferAmount;
    console.log(
      "Expected recipient balance:",
      ethers.formatEther(expectedRecipientBalance),
      "ETH"
    );

    expect(recipientBalanceAfter).to.equal(expectedRecipientBalance);
    console.log("Test completed successfully.");
  });
});
